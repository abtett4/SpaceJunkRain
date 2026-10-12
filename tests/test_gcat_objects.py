import copy
import datetime as dt
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from event_time import EPOCH, UTC, apply_event_times  # noqa: E402
from gcat_objects import enrich_catalog, enrich_event  # noqa: E402

META = {'files': {'launch.tsv': {'sha256': 'x', 'updated': 'Updated test'}}, 'home': 'h', 'license': 'CC-BY-4.0',
        'citation': 'c', 'retrievedAt': 'r'}


def catalog(rows):
    days = [(dt.datetime(*d, tzinfo=UTC) - EPOCH).total_seconds() / 86400 for _, d in rows]
    doc = {'meta': {'epoch': '1957-01-01T00:00:00Z', 'preciseEpochs': 0},
           'cols': {'id': [n for n, _ in rows], 'd': days, 'p': [0] * len(rows), 'k': [0] * len(rows)}}
    return apply_event_times(doc)


class GcatObjectTests(unittest.TestCase):
    def test_times_only_on_the_same_day_and_never_for_curated_objects(self):
        doc = catalog([(1, (2020, 5, 1)), (2, (2020, 5, 1)), (37820, (2018, 4, 2))])
        gcat = {1: {'decayTime': dt.datetime(2020, 5, 1, 6, 30, tzinfo=UTC), 'decayResolution': 60},
                2: {'decayTime': dt.datetime(2020, 5, 2, 0, 10, tzinfo=UTC), 'decayResolution': 60},
                37820: {'decayTime': dt.datetime(2018, 4, 2, 0, 16, tzinfo=UTC), 'decayResolution': 60}}
        applied, disagree = enrich_catalog(doc, gcat, META)
        self.assertEqual((applied, disagree), (1, 1))
        row = dict(zip(doc['cols']['id'], zip(doc['cols']['d'], doc['cols']['p'])))
        self.assertEqual(row[1][1], 1)
        self.assertEqual(EPOCH + dt.timedelta(days=row[1][0]), dt.datetime(2020, 5, 1, 6, 30, tzinfo=UTC))
        self.assertEqual((row[2][1], row[37820][1]), (0, 0))
        again = copy.deepcopy(doc)
        self.assertEqual(enrich_catalog(again, gcat, META), (0, 1))
        self.assertEqual(again['cols'], doc['cols'])

    def test_event_gets_orbit_elements_size_and_owner_only_when_missing(self):
        event = {'attributes': {}, 'orbitalData': {}, 'sources': {}, 'eventTime': {'precision': 'day'}}
        record = {'orbit': {'perigeeKm': 300.0, 'apogeeKm': 320.0, 'inclinationDeg': 51.6, 'epochUtc': '2011-01-05T00:00:00Z', 'regime': 'LEO'},
                  'size': {'massKg': 7284.0}, 'owner': {'code': 'RKKE', 'name': 'RKKE'}, 'state': {'code': 'RU', 'name': 'Russia'}}
        enrich_event(event, record, {'url': 'u'})
        self.assertEqual(event['orbitalData']['elements']['epochUtc'], event['attributes']['orbitReference']['epochUtc'])
        self.assertEqual(event['attributes']['ownerCountry']['value'], 'Russia')
        prepared = {'attributes': {}, 'orbitalData': {'reference': {'asset': 'a.json'}}, 'sources': {}, 'eventTime': {'precision': 'day'}}
        enrich_event(prepared, record, {'url': 'u'})
        self.assertEqual(list(prepared['orbitalData']), ['reference'])  # prepared evidence wins


if __name__ == '__main__':
    unittest.main()
