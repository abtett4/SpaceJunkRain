import copy
import hashlib
import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from build_tracers import build_manifest
from event_time import apply_event_times


class TracerManifestTests(unittest.TestCase):
    def setUp(self):
        # Synthetic metadata paired with the public derived geometry: no raw cache needed.
        self.row = {"GP_ID": "1", "NORAD_CAT_ID": "37820", "OBJECT_TYPE": "PAYLOAD",
                    "INCLINATION": "42", "RA_OF_ASC_NODE": "196", "PERIAPSIS": "145",
                    "APOAPSIS": "152", "ECCENTRICITY": "0.001", "PERIOD": "87"}
        geometry = json.loads((ROOT / "web/data/trajectories/37820.json").read_text())
        event = json.loads((ROOT / "web/data/tracers.json").read_text())["events"][0]
        self.t = {**geometry, "name": "Fixture", "type": "PAYLOAD", "objectId": "2011-053A",
                  "launchFamily": "2011-053", "decay": event["eventTime"], "sources": {},
                  "element": {"gpId": "1", "epoch": "2018-04-01T16:00:00Z",
                              "sha256": hashlib.sha256(json.dumps(self.row, sort_keys=True).encode()).hexdigest(),
                              "ageAtReportedDecayHours": [8, 32]},
                  "diagnostics": {"referenceSphereRadiusKm": 6378.135,
                                  "radiusMinusReferenceRangeKm": [130, 142], "neighborComparison": {}}}
        self.catalog = json.loads((ROOT / "web/data/decays.json").read_text())

    def build(self):
        return build_manifest(self.t, "fixture-hash", [self.row], self.catalog)

    def test_joins_anchor_preserves_samples_and_unknown_attributes(self):
        before = copy.deepcopy(self.t)
        manifest, geometry = self.build()
        self.assertEqual(geometry["trace"], self.t["trace"])
        self.assertEqual(self.t, before)
        self.assertEqual(manifest["presentation"]["displayAnchorUtc"], "2018-04-02T15:35:52Z")
        self.assertEqual(manifest["presentation"]["endTime"], "2018-04-02T15:35:52Z")
        for key in ("owner", "missionType", "eventLocation", "physicalSize", "orbitRegimeLifetime"):
            self.assertIsNone(manifest["attributes"][key]["value"])
            self.assertEqual(manifest["attributes"][key]["basis"], "unknown")
        self.assertEqual(manifest["attributes"]["orbitRegimeNearEvent"]["value"], "LEO")

    def test_source_hash_mismatch_is_rejected(self):
        self.row["INCLINATION"] = "43"
        with self.assertRaisesRegex(ValueError, "hash"):
            self.build()

    def test_timeline_disagreement_is_rejected(self):
        i = self.catalog["cols"]["id"].index(37820)
        self.catalog["cols"]["d"][i] += 1
        with self.assertRaisesRegex(ValueError, "timing/precision"):
            self.build()

    def test_invalid_geometry_and_wrong_frame_are_rejected(self):
        for field, value in (("frame", "ITRF"), ("trace", self.t["trace"][::-1]),
                             ("trace", [["2018-04-01T23:00:00Z", float('nan'), 0, 0]])):
            original = self.t[field]
            self.t[field] = value
            with self.assertRaises(ValueError):
                self.build()
            self.t[field] = original


if __name__ == "__main__":
    unittest.main()
