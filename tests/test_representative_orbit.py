import copy
import json
import math
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from representative_orbit import representative_loop, RADIUS_KM
from build_tracers import build_fallback_manifest


class RepresentativeTests(unittest.TestCase):
    def setUp(self):
        self.row = {"NORAD_CAT_ID": "38023", "GP_ID": "1", "EPOCH": "2022-11-08T12:00:00Z",
                    "INCLINATION": "86", "PERIAPSIS": "623", "APOAPSIS": "753", "PERIOD": "98.5"}
        self.catalog = json.loads((ROOT / "web/data/decays.json").read_text())

    def loop(self, row=None):
        return representative_loop(self.row if row is None else row, "fixture:reentry", 38023, self.row["EPOCH"])

    def test_shape_inclination_period_and_closed_seam(self):
        g = self.loop()
        trace = g["trace"]
        self.assertEqual(trace[-1][0], 98.5 * 60)
        self.assertEqual(trace[0][1:], trace[-1][1:])
        radii = [math.hypot(*p[1:]) - RADIUS_KM for p in trace]
        self.assertAlmostEqual(min(radii), 623, delta=0.01)
        self.assertAlmostEqual(max(radii), 753, delta=0.01)
        a, b = trace[0][1:], trace[1][1:]
        normal = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
        self.assertAlmostEqual(math.degrees(math.acos(normal[2]/math.hypot(*normal))), 86)
        self.assertEqual(g["timeSystem"], "loop-seconds")
        self.assertEqual(g["frame"], "illustrative-equatorial")

    def test_circular_reference_and_missing_period_are_supported_without_invented_source_fields(self):
        row = {**self.row, "PERIAPSIS": "300", "APOAPSIS": "300", "INCLINATION": "90", "PERIOD": None}
        before = copy.deepcopy(row)
        g = self.loop(row)
        self.assertEqual(row, before)
        self.assertEqual(g["construction"]["periodBasis"], "two-body-derived-from-reference-heights")
        for p in g["trace"]:
            self.assertAlmostEqual(math.hypot(*p[1:]), RADIUS_KM + 300)
            self.assertAlmostEqual(p[2], 0)

    def test_phase_is_deterministic_and_stale_node_and_anomaly_are_not_used(self):
        original = self.loop()
        self.assertEqual(original, self.loop({**self.row, "RA_OF_ASC_NODE": "210", "MEAN_ANOMALY": "173"}))
        self.assertEqual(original["construction"]["nodeDeg"], 0)

    def test_invalid_and_unsupported_geometry_is_rejected(self):
        for changes in ({"INCLINATION": None}, {"PERIAPSIS": "nan"}, {"PERIAPSIS": "0"},
                        {"APOAPSIS": "600"}, {"PERIOD": "0"}, {"INCLINATION": "181"},
                        {"REF_FRAME": "ITRF"}, {"APOAPSIS": "2000000"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.loop({**self.row, **changes})

    def test_stale_reference_does_not_become_near_event_evidence(self):
        before = copy.deepcopy(self.row)
        event, geometry = build_fallback_manifest(38023, [self.row], self.catalog, {})
        self.assertEqual(self.row, before)
        self.assertEqual(event["presentation"]["mode"], "representative-orbit")
        self.assertEqual(event["attributes"]["orbitReference"]["epochUtc"], self.row["EPOCH"])
        self.assertIsNone(event["attributes"]["orbitNearEvent"]["value"])
        self.assertIsNone(event["attributes"]["orbitRegimeNearEvent"]["value"])
        self.assertIsNone(event["presentation"]["geographicEndpoint"])
        self.assertGreater(event["bounds"]["sourceElementAgeAtReportedDecayHours"][0], 400 * 24)
        self.assertEqual(geometry["id"], 38023)

    def test_empty_history_is_symbolic_and_retains_the_same_event_anchor(self):
        orbit, _ = build_fallback_manifest(38023, [self.row], self.catalog, {})
        event, geometry = build_fallback_manifest(38023, [], self.catalog, {})
        self.assertIsNone(geometry)
        self.assertEqual(event["presentation"]["mode"], "symbolic-event")
        self.assertEqual(event["presentation"]["displayAnchorUtc"], orbit["presentation"]["displayAnchorUtc"])
        self.assertEqual(event["eventId"], orbit["eventId"])
        self.assertIsNone(event["presentation"]["geometryAsset"])
        self.assertIsNone(event["attributes"]["orbitReference"]["inclinationDeg"])
        self.assertEqual(event["attributes"]["orbitReference"]["basis"], "unknown")
        self.assertEqual(event["attributes"]["objectType"]["value"], "DEBRIS")

    def test_partial_invalid_geometry_falls_back_without_serializing_nan(self):
        event, geometry = build_fallback_manifest(38023, [{**self.row, "PERIAPSIS": "nan"}], self.catalog, {})
        self.assertIsNone(geometry)
        self.assertIsNone(event["attributes"]["orbitReference"]["perigeeKm"])
        json.dumps(event, allow_nan=False)

    def test_wrong_identity_or_clock_policy_is_not_silently_downgraded(self):
        with self.assertRaisesRegex(ValueError, "query"):
            build_fallback_manifest(38023, [], self.catalog, {"gpHistory": {"query": "/class/gp_history/NORAD_CAT_ID/37820/"}})
        with self.assertRaisesRegex(ValueError, "NORAD"):
            build_fallback_manifest(38023, [{**self.row, "NORAD_CAT_ID": "37820"}], self.catalog, {})
        i = self.catalog["cols"]["id"].index(38023)
        self.catalog["cols"]["d"][i] += 0.01
        with self.assertRaisesRegex(ValueError, "anchor"):
            build_fallback_manifest(38023, [self.row], self.catalog, {})


if __name__ == "__main__":
    unittest.main()
