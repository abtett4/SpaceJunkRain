"""Offline science/format checks using synthetic records and a Vallado reference case."""
import datetime as dt
import math
import pathlib
import sys
import unittest
from unittest import mock

try:
    from sgp4.api import Satrec
    from sgp4 import exporter
except ModuleNotFoundError:
    raise unittest.SkipTest("Install requirements-orbit.txt to run orbital checks.")

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tools"))
import propagate as orbit

# Vallado verification case 00005 from sgp4's SGP4-VER.TLE / tcppver.out.
# Dates/types/GP IDs used to exercise selection below are synthetic.
LINE1 = "1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753"
LINE2 = "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667"


def reference_row():
    row = exporter.export_omm(Satrec.twoline2rv(LINE1, LINE2), "SYNTHETIC VERIFICATION RECORD")
    row.update(GP_ID="1", CREATION_DATE="2000-06-27T19:00:00", OBJECT_TYPE="PAYLOAD")
    return row


def decay_row(value="2000-06-28 0:00:00"):
    return {"NORAD_CAT_ID": "5", "MSG_TYPE": "Historical", "PRECEDENCE": "1",
            "DECAY_EPOCH": value, "SOURCE": "synthetic-test"}


class PropagationTests(unittest.TestCase):
    def test_omm_initialization_and_time_conversion_match_vallado_reference(self):
        row = reference_row()
        error, r, v = orbit.state_at(orbit.initialize(row), orbit.timestamp(row["EPOCH"]))
        self.assertEqual(error, 0)
        for actual, expected in zip(r, [7022.46529266, -1400.08296755, 0.03995155]):
            self.assertAlmostEqual(actual, expected, delta=2e-5)
        for actual, expected in zip(v, [1.893841015, 6.405893759, 4.534807250]):
            self.assertAlmostEqual(actual, expected, delta=2e-8)

    def test_midnight_remains_date_only_without_noon_shift(self):
        info, cutoff, end = orbit.decay_context([decay_row()], 5)
        self.assertEqual(info["precision"], "day")
        self.assertEqual(orbit.iso(cutoff), "2000-06-28T00:00:00Z")
        self.assertEqual((end - cutoff).total_seconds(), 86400)

    def test_non_midnight_time_is_preserved_without_claiming_accuracy(self):
        info, cutoff, end = orbit.decay_context([decay_row("2000-06-28T01:02:03Z")], 5)
        self.assertEqual(info["precision"], "reported-time")
        self.assertEqual(orbit.iso(cutoff), "2000-06-28T01:02:03Z")
        self.assertEqual(cutoff, end)
        self.assertIn("uncertainty is not supplied", info["intervalMeaning"])

    def test_timestamp_does_not_round_microseconds(self):
        t = orbit.timestamp("2018-04-01T16:07:05.931552")
        self.assertEqual(t.microsecond, 931552)
        self.assertEqual(t.tzinfo, dt.timezone.utc)

    def test_conflicting_decay_dates_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "disagree on the date"):
            orbit.decay_context([decay_row(), dict(decay_row("2000-06-29"), PRECEDENCE="2")], 5)

    def test_conflicting_equal_precedence_times_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "equal-precedence"):
            orbit.decay_context([decay_row("2000-06-28T01:00:00Z"), decay_row("2000-06-28T02:00:00Z")], 5)

    def test_predictions_do_not_establish_historical_decay(self):
        with self.assertRaisesRegex(ValueError, "No historical"):
            orbit.decay_context([dict(decay_row(), MSG_TYPE="Prediction")], 5)

    def test_selection_uses_latest_pre_cutoff_epoch_and_ignores_later_elements(self):
        row = reference_row()
        earlier = dict(row, GP_ID="2", EPOCH="2000-06-27T17:00:00", CREATION_DATE="2000-06-27T22:00:00")
        later = dict(row, GP_ID="3", EPOCH="2000-06-28T01:00:00")
        selected, sat, rejected = orbit.choose_element([later, earlier, row], 5, orbit.timestamp("2000-06-28"), 24)
        self.assertEqual(selected["GP_ID"], "1")
        self.assertFalse(rejected)

    def test_invalid_latest_set_falls_back_with_recorded_reason(self):
        row = reference_row()
        invalid = dict(row, GP_ID="2", EPOCH="2000-06-27T20:00:00", MEAN_MOTION="nan")
        selected, sat, rejected = orbit.choose_element([row, invalid], 5, orbit.timestamp("2000-06-28"), 24)
        self.assertEqual(selected["GP_ID"], "1")
        self.assertEqual(rejected[0]["gpId"], "2")

    def test_stale_elements_fail_instead_of_propagating_across_long_gaps(self):
        with self.assertRaisesRegex(ValueError, "screening limit"):
            orbit.choose_element([reference_row()], 5, orbit.timestamp("2001-06-28"), 24)

    def test_other_object_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "different NORAD"):
            orbit.choose_element([reference_row()], 999, orbit.timestamp("2000-06-28"), 24)

    def test_missing_drag_and_wrong_coordinate_frame_are_rejected(self):
        row = reference_row()
        del row["BSTAR"]
        with self.assertRaises(KeyError):
            orbit.initialize(row)
        with self.assertRaisesRegex(ValueError, "REF_FRAME"):
            orbit.initialize(dict(reference_row(), REF_FRAME="ITRF"))

    def test_sampling_includes_endpoint_without_overshooting(self):
        row = reference_row()
        sat = orbit.initialize(row)
        start = orbit.timestamp(row["EPOCH"])
        end = start + dt.timedelta(seconds=65)
        trace, samples, termination = orbit.sample_orbit(sat, start, end, 30)
        self.assertEqual(len(trace), 4)
        self.assertEqual(trace[-1][0], orbit.iso(end))
        self.assertEqual(termination["reason"], "requested-cutoff")
        self.assertTrue(all(orbit.timestamp(a[0]) < orbit.timestamp(b[0]) for a, b in zip(trace, trace[1:])))

    def test_sgp4_error_six_truncates_before_underground_sample(self):
        sat = mock.Mock(radiusearthkm=6378.135)
        good = (0, (7000, 0, 0), (0, 7, 0))
        bad = (6, (6000, 0, 0), (0, 8, 0))
        start = orbit.timestamp("2000-06-28")
        with mock.patch.object(orbit, "state_at", side_effect=[good, good, bad]):
            trace, samples, termination = orbit.sample_orbit(sat, start, start + dt.timedelta(seconds=90), 30)
        self.assertEqual(len(trace), 2)
        self.assertEqual(termination["code"], 6)
        self.assertEqual(termination["time"], orbit.iso(start + dt.timedelta(seconds=60)))

    def test_nonfinite_coordinates_are_not_exported(self):
        sat = mock.Mock(radiusearthkm=6378.135)
        good = (0, (7000, 0, 0), (0, 7, 0))
        bad = (0, (math.nan, 0, 0), (0, 8, 0))
        start = orbit.timestamp("2000-06-28")
        with mock.patch.object(orbit, "state_at", side_effect=[good, good, bad]):
            trace, samples, termination = orbit.sample_orbit(sat, start, start + dt.timedelta(seconds=90), 30)
        self.assertEqual(len(trace), 2)
        self.assertEqual(termination["reason"], "non-finite-state")

    def test_export_contract_keeps_uncertainty_frame_units_and_object_identity(self):
        result, samples = orbit.build_trajectory([reference_row()], [decay_row()], 5)
        self.assertEqual(result["id"], 5)
        self.assertEqual(result["frame"], "TEME")
        self.assertEqual(result["units"], "km")
        self.assertEqual(result["timeSystem"], "UTC")
        self.assertEqual(result["diagnostics"]["sampleCount"], 241)
        lo, hi = result["element"]["ageAtReportedDecayHours"]
        self.assertAlmostEqual(hi - lo, 24)
        self.assertEqual(result["endTime"], "2000-06-28T00:00:00Z")

    def test_bad_sampling_parameters_fail(self):
        for step in [0, -1, math.nan, math.inf]:
            with self.subTest(step=step), self.assertRaises(ValueError):
                orbit.build_trajectory([reference_row()], [decay_row()], 5, step_seconds=step)


if __name__ == "__main__":
    unittest.main()
