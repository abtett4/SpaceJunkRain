import copy
import datetime as dt
import hashlib
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from mixed_sample import build_sample, import_event


class MixedSampleTests(unittest.TestCase):
    def setUp(self):
        self.spec = json.loads((ROOT / "data/samples/april-2018.json").read_text())
        self.catalog = json.loads((ROOT / "web/data/decays.json").read_text())

    def history(self, path):
        nid = int(path.parts[-3])
        index = self.catalog["cols"]["id"].index(nid)
        anchor = dt.datetime(1957, 1, 1, tzinfo=dt.timezone.utc) + dt.timedelta(days=self.catalog["cols"]["d"][index])
        epoch = anchor.replace(hour=0, minute=0, second=0, microsecond=0)-dt.timedelta(hours=6)
        rows = [] if nid == 31777 else [{"NORAD_CAT_ID": str(nid), "GP_ID": "1", "EPOCH": epoch.isoformat(),
                                      "INCLINATION": "50", "PERIAPSIS": "170", "APOAPSIS": "190", "PERIOD": "88"}]
        return rows, {"path": str(path), "query": f"/class/gp_history/NORAD_CAT_ID/{nid}/", "rowCount": len(rows)}

    def build(self, spec=None):
        with patch("mixed_sample.load_gp_snapshot", side_effect=self.history):
            return build_sample(spec or self.spec, self.catalog, {"source": "fixture"}, ROOT)

    def test_complete_interval_mixed_classes_and_chronological_order(self):
        before = copy.deepcopy(self.spec)
        doc, assets = self.build()
        self.assertEqual(self.spec, before)
        self.assertEqual(len(doc["events"]), 12)
        self.assertEqual(doc["sample"]["objectTypes"], {"DEBRIS": 5, "PAYLOAD": 6, "ROCKET BODY": 1, "UNKNOWN": 0})
        anchors = [e["presentation"]["displayAnchorUtc"] for e in doc["events"]]
        self.assertEqual(anchors, sorted(anchors))
        self.assertEqual(assets["trajectories/37820.json"], (ROOT / "web/data/trajectories/37820.json").read_bytes())
        for event in doc["events"]:
            if name := event["presentation"]["geometryAsset"]:
                self.assertEqual(hashlib.sha256(assets[name]).hexdigest(), event["geometryProvenance"]["assetSha256"])

    def test_empty_query_and_unqueried_inputs_are_distinct_and_location_stays_unknown(self):
        doc, _ = self.build()
        self.assertEqual(doc["sample"]["coverage"], {"propagatedInput": 1, "referenceInput": 5, "symbolicInput": 6,
                                                   "historyNotQueried": 5, "historyQueryEmpty": 1})
        empty = next(e for e in doc["events"] if e["object"]["noradId"] == 31777)
        self.assertEqual(empty["sources"]["gpHistory"]["rowCount"], 0)
        for event in doc["events"]:
            if event["presentation"]["mode"] == "symbolic-event":
                self.assertEqual(event["presentation"]["surfacePulse"]["durationSeconds"], 14400)
                self.assertIsNone(event["attributes"]["eventLocation"]["value"])
                self.assertIsNone(event["presentation"]["geometryAsset"])
                if event != empty:
                    self.assertEqual(event["sources"]["gpHistory"]["status"], "not-queried")
                    self.assertIn("not fetched", event["presentation"]["modeReason"])

    def test_missing_and_duplicate_membership_fail_instead_of_changing_the_sample(self):
        for entries in [self.spec["inputs"][:-1], self.spec["inputs"] + [self.spec["inputs"][0]]]:
            with self.assertRaisesRegex(ValueError, "every catalog|distinct"):
                self.build({**self.spec, "inputs": entries})

    def test_ambiguous_input_or_invalid_interval_fails(self):
        spec = copy.deepcopy(self.spec)
        spec["inputs"][0]["catalogOnly"] = True
        with self.assertRaisesRegex(ValueError, "exactly one"):
            self.build(spec)
        spec = copy.deepcopy(self.spec)
        spec["sample"]["intervalUtc"].reverse()
        with self.assertRaisesRegex(ValueError, "increasing interval"):
            self.build(spec)

    def test_corrupt_snapshot_does_not_silently_become_a_pulse(self):
        with patch("mixed_sample.load_gp_snapshot", side_effect=ValueError("Corrupt snapshot")):
            with self.assertRaisesRegex(ValueError, "Corrupt snapshot"):
                build_sample(self.spec, self.catalog, {}, ROOT)

    def test_import_cannot_upgrade_date_precision_or_disagree_with_its_reported_day(self):
        for field, value in [("precision", "reported-time"), ("date", "2018-04-01")]:
            def changed(path, nid):
                event, assets = import_event(path, nid)
                event["eventTime"][field] = value
                return event, assets
            with patch("mixed_sample.import_event", side_effect=changed):
                with self.assertRaisesRegex(ValueError, "catalog"):
                    self.build()

    def test_import_rejects_wrong_identity_and_changed_geometry(self):
        with self.assertRaisesRegex(ValueError, "NORAD"):
            import_event(ROOT / "web/data/tracers.json", 12345)
        with tempfile.TemporaryDirectory() as temp:
            path = pathlib.Path(temp)
            doc = json.loads((ROOT / "web/data/tracers.json").read_text())
            asset = doc["events"][0]["presentation"]["geometryAsset"]
            (path / asset).parent.mkdir(parents=True)
            (path / asset).write_text("{}")
            (path / "tracers.json").write_text(json.dumps(doc))
            with self.assertRaisesRegex(ValueError, "checksum"):
                import_event(path / "tracers.json", 37820)


if __name__ == "__main__":
    unittest.main()
