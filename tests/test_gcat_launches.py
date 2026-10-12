import datetime as dt
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from gcat_launches import launch_event, orbital_launches, parse_time  # noqa: E402

UTC = dt.timezone.utc
LAUNCH = '#Launch_Tag\tLaunch_Date\tLV_Type\tFlight_ID\tFlight\tMission\tLaunch_Site\tLaunch_Pad\tAgency\tLaunchCode\n# Updated test\n'
LP = '#Site\tCode\tUCode\tType\tStateCode\tTStart\tTStop\tShortName\tName\tLocation\tLongitude\tLatitude\n'
SITES = '#Site\tCode\tUCode\tType\tStateCode\tTStart\tTStop\tShortName\tName\tLocation\tLongitude\tLatitude\n'


class GcatLaunchTests(unittest.TestCase):
    def test_times_keep_gcat_precision(self):
        self.assertEqual(parse_time('1957 Oct  4 1928:34'), (dt.datetime(1957, 10, 4, 19, 28, 34, tzinfo=UTC), 1))
        self.assertEqual(parse_time('2026 Oct  7 0325'), (dt.datetime(2026, 10, 7, 3, 25, tzinfo=UTC), 60))
        self.assertEqual(parse_time('1958 Jan 31'), (dt.datetime(1958, 1, 31, tzinfo=UTC), 86400))
        with self.assertRaises(ValueError):
            parse_time('sometime')

    def test_orbital_only_pads_resolve_through_site_renames_and_failures_are_marked(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / 'launch.tsv').write_text(LAUNCH
                + '1957 ALP\t1957 Oct  4 1928:34\tSputnik 8K71PS\tM1-PS\tPS-1\tPS-1\tNIIP-5\tLC1\tMVS\tOS\n'
                + '1957-F01\t1957 Dec  6 1644:35\tVanguard\tTV-3\tVanguard TV3\t-\tCC\tLC18A\tNRL\tOF\n'
                + '1957-S01\t1957 Dec  7\tAerobee\t-\t-\t-\tCC\tLC18A\tNRL\tSS\n')
            (d / 'lp.tsv').write_text(LP + 'GIK-5\tLC1\t-\tLP\t-\t1957\t*\tGIK-5 LC1\tPad 1, Baykonur\t-\t63.3423\t45.9203\n')
            (d / 'sites.tsv').write_text(SITES + 'NIIP-5\t-\tGIK-5\tLS\t-\t1956\t1989\tBaykonur\tNIIP-5\t-\t63.0\t46.0\n'
                                         + 'GIK-5\t-\tGIK-5\tLS\t-\t1989\t*\tBaykonur\tGIK-5\t-\t63.0\t46.0\n'
                                         + 'CC\t-\tCC\tLS\t-\t1950\t*\tCanaveral\tCape Canaveral\t-\t-80.6\t28.5\n')
            launches = orbital_launches(d)
        self.assertEqual([l['tag'] for l in launches], ['1957-ALP', '1957-F01'])  # suborbital dropped
        sputnik, vanguard = launches
        self.assertEqual((sputnik['site']['precision'], sputnik['site']['latitudeDeg']), ('pad', 45.9203))
        self.assertEqual((vanguard['site']['precision'], vanguard['site']['place']), ('site', 'Canaveral'))
        self.assertEqual(vanguard['outcome'], 'failure')
        event = launch_event(vanguard, {'url': 'https://planet4589.org/space/gcat/'})
        self.assertEqual(event['eventId'], '1957-F01:launch:1957-12-06')
        self.assertEqual(event['eventTime']['intervalUtc'], ['1957-12-06T16:44:35Z', '1957-12-06T16:44:36Z'])
        self.assertIsNone(event['object']['noradId'])
        self.assertEqual(event['orbitalData'], {})


if __name__ == '__main__':
    unittest.main()
