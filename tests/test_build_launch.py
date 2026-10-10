import copy
import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from build_launch import build_launch, compose


class LaunchTests(unittest.TestCase):
    def setUp(self):
        self.spec = json.loads((ROOT / 'data/launch-example.json').read_text())
        self.catalog = json.loads((ROOT / 'web/data/decays.json').read_text())
        self.source = {'query': '/basicspacedata/query/class/gp_history/NORAD_CAT_ID/43267/'}
        # Small test record: source descriptors from the included processed example.
        self.row = {'NORAD_CAT_ID': '43267', 'OBJECT_ID': '2018-032A', 'GP_ID': '119065123',
                    'EPOCH': '2018-04-02T20:54:48.108096', 'INCLINATION': '51.6437',
                    'PERIAPSIS': '203.778', 'APOAPSIS': '356.600', 'PERIOD': '90.117', 'OBJECT_TYPE': 'TBA'}

    def build(self, rows=None):
        return build_launch(self.spec, rows if rows is not None else [self.row], self.catalog, self.source)

    def test_reported_minute_site_and_catalog_class_are_preserved(self):
        event, geometry = self.build()
        self.assertEqual(event['eventTime']['intervalUtc'], ['2018-04-02T20:30:00Z', '2018-04-02T20:31:00Z'])
        self.assertEqual(event['attributes']['objectType']['value'], 'PAYLOAD')
        self.assertEqual(event['presentation']['surfacePulse']['longitudeDeg'], -80.5772)
        self.assertAlmostEqual(event['bounds']['sourceDelayAfterLaunchSeconds'], 1488.108096)
        self.assertEqual(geometry['frame'], 'illustrative-equatorial')
        self.assertEqual(geometry['construction']['inclinationDeg'], 51.6437)

    def test_earliest_usable_post_launch_epoch_then_largest_gp_id(self):
        before = {**self.row, 'EPOCH': '2018-04-02T20:20:00', 'GP_ID': '1'}
        later = {**self.row, 'EPOCH': '2018-04-02T21:30:00', 'GP_ID': '999999999'}
        duplicate = {**self.row, 'GP_ID': '119065128'}
        bad = {**self.row, 'EPOCH': '2018-04-02T20:40:00', 'GP_ID': '2', 'PERIAPSIS': '-20'}
        event, _ = self.build([later, duplicate, self.row, before, bad])
        self.assertEqual(event['geometryProvenance']['gpId'], '119065128')
        self.assertEqual(event['geometryProvenance']['skippedRecords'][0]['gpId'], '2')

    def test_empty_and_outside_window_do_not_invent_an_orbit(self):
        for rows in [[], [{**self.row, 'EPOCH': '2018-04-04T20:30:00'}]]:
            with self.assertRaisesRegex(ValueError, 'No usable'):
                self.build(rows)

    def test_wrong_identity_and_parent_launch_debris_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'identity'):
            self.build([{**self.row, 'OBJECT_ID': '2018-999A'}])
        index = self.catalog['cols']['id'].index(43267)
        self.catalog['cols']['k'][index] = self.catalog['meta']['types'].index('DEBRIS')
        with self.assertRaisesRegex(ValueError, 'debris parent-launch'):
            self.build()

    def test_time_site_and_day_must_be_consistent(self):
        for field, value in [('reportedTimeUtc', '2018-04-03T20:30:00Z'), ('timeResolutionSeconds', 1)]:
            old = self.spec[field]; self.spec[field] = value
            with self.assertRaises(ValueError): self.build()
            self.spec[field] = old
        self.spec['site']['latitudeDeg'] = float('nan')
        with self.assertRaisesRegex(ValueError, 'coordinates'): self.build()

    def test_composition_keeps_reentries_and_inputs_immutable(self):
        source_dir = ROOT / 'web/data/samples/april-2018'
        original = json.loads((source_dir / 'tracers.json').read_text())
        event, _ = self.build()
        before = copy.deepcopy([original, self.spec, self.row, self.catalog])
        output_dir = ROOT / 'web/data/samples/april-2018-launch'
        combined = compose(original, event, source_dir, output_dir)
        self.assertEqual([original, self.spec, self.row, self.catalog], before)
        self.assertEqual(combined['sample']['eventCount'], 13)
        self.assertEqual(combined['sample']['reentryCount'], 12)
        self.assertEqual(combined['sample']['selectedLaunchCount'], 1)
        for old in original['events']:
            new = next(e for e in combined['events'] if e['eventId'] == old['eventId'])
            self.assertEqual(new['eventTime'], old['eventTime'])
            asset = new['presentation'].get('geometryAsset')
            if asset: self.assertTrue((output_dir / asset).exists())


if __name__ == '__main__':
    unittest.main()
