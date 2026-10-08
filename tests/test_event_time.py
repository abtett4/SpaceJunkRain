import copy
import datetime as dt
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tools"))
from event_time import EPOCH, apply_event_times, display_anchor, event_id
import build_data


class EventTimeTests(unittest.TestCase):
    def test_random_times_stay_in_leap_day_and_are_repeatable(self):
        date = "2024-02-29"
        times = [display_anchor(event_id(n, "reentry", date), date) for n in range(1000)]
        self.assertTrue(all(t.date().isoformat() == date for t in times))
        self.assertEqual(set(t.hour for t in times), set(range(24)))
        self.assertGreater(len(set(times)), 980)
        self.assertEqual(times[5], display_anchor(event_id(5, "reentry", date), date))
        self.assertNotEqual(times[5], display_anchor(event_id(5, "launch", date), date))

    def test_sort_keeps_columns_joined_and_preserves_source_days(self):
        doc = {"meta": {"epoch": "1957-01-01T00:00:00Z", "preciseEpochs": 0},
               "cols": {"id": list(range(500)), "d": [20000.5] * 500,
                        "nm": [f"object {n}" for n in range(500)]}}
        result = apply_event_times(doc)
        self.assertEqual(result["cols"]["d"], sorted(result["cols"]["d"]))
        for nid, day, name in zip(*[result["cols"][k] for k in ("id", "d", "nm")]):
            self.assertEqual(int(day), 20000)
            self.assertEqual(name, f"object {nid}")
        self.assertEqual(apply_event_times(copy.deepcopy(result)), result)
        self.assertEqual(result["meta"]["preciseEpochs"], 0)

    def test_reported_noon_stays_reported_and_exact(self):
        doc = {"meta": {"epoch": "1957-01-01T00:00:00Z"},
               "cols": {"id": [1, 2], "d": [20000.5, 20000.5], "p": [1, 0]}}
        result = apply_event_times(doc)
        i = result["cols"]["id"].index(1)
        self.assertEqual(result["cols"]["d"][i], 20000.5)
        self.assertEqual(result["meta"]["preciseEpochs"], 1)

    def test_ambiguous_legacy_precision_is_not_guessed(self):
        for count, days in ((1, [20000.5]), (0, [20000.3])):
            with self.assertRaisesRegex(ValueError, "infer precision"):
                apply_event_times({"meta": {"epoch": "1957-01-01T00:00:00Z", "preciseEpochs": count},
                                   "cols": {"id": [1], "d": days}})

    def test_anchor_matches_exportable_whole_second(self):
        anchor = display_anchor("37820:reentry:2018-04-02", "2018-04-02")
        day = (anchor - EPOCH).total_seconds() / 86400
        self.assertEqual(EPOCH + dt.timedelta(days=day), anchor)

    def test_catalog_build_distinguishes_day_noon_and_fractional_timestamp(self):
        rows = [{"NORAD_CAT_ID": n, "DECAY": stamp, "LAUNCH": "2017-01-01",
                 "INTLDES": "2017-001A", "SATNAME": f"Fixture {n}", "OBJECT_TYPE": "PAYLOAD"}
                for n, stamp in enumerate(("2018-04-02 0:00:00", "2018-04-02T12:00:00Z",
                                            "2018-04-02T15:12:13.125Z"), 1)]
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / "data").mkdir()
            (root / "data/events.json").write_text('{"events": []}')
            output = root / "web/data/decays.json"
            with patch.object(build_data, "ROOT", root), patch.object(build_data, "OUT", output), \
                 patch.object(build_data, "load_decay_rows", return_value={}), \
                 patch.object(build_data, "load_satcat", return_value=(rows, "fixture", False)), \
                 patch.object(sys, "argv", ["build_data.py"]):
                build_data.main()
            doc = json.loads(output.read_text())
        c = doc["cols"]
        for nid, expected, precise in ((1, display_anchor("1:reentry:2018-04-02", "2018-04-02"), 0),
                                      (2, build_data.source_timestamp(rows[1]["DECAY"]), 1),
                                      (3, build_data.source_timestamp(rows[2]["DECAY"]), 1)):
            i = c["id"].index(nid)
            self.assertEqual(c["p"][i], precise)
            self.assertAlmostEqual((EPOCH + dt.timedelta(days=c["d"][i]) - expected).total_seconds(), 0, places=5)
        self.assertEqual(doc["meta"]["preciseEpochs"], 2)


if __name__ == "__main__":
    unittest.main()
