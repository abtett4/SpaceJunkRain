"""Offline acquisition tests. All response records below are synthetic."""
import contextlib
import hashlib
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location(
    "spacetrack_fetch", pathlib.Path(__file__).resolve().parents[1] / "tools" / "spacetrack_fetch.py")
fetch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fetch)


class AcquisitionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.raw = self.root / "data" / "raw"
        for key, value in (("ROOT", self.root), ("RAW", self.raw)):
            patch = mock.patch.object(fetch, key, value)
            patch.start()
            self.addCleanup(patch.stop)
        self.session_patch = mock.patch.object(fetch, "authenticated_session")
        self.session = self.session_patch.start()
        self.addCleanup(self.session_patch.stop)
        self.network_patch = mock.patch.object(fetch, "fetch_json")
        self.network = self.network_patch.start()
        self.addCleanup(self.network_patch.stop)
        self.rows = [{"NORAD_CAT_ID": "38023", "EPOCH": "2024-01-04T23:01:02.123456",
                      "BSTAR": "0.001234", "OBJECT_NAME": "SYNTHETIC TEST RECORD"}]
        self.body = (json.dumps(self.rows, indent=2) + "\n").encode()
        self.network.return_value = self.body, self.rows
        self.args = ["gp_history", "--norad-id", "38023", "--start", "2024-01-02T00:00:00Z",
                     "--end", "2024-01-05T00:00:00Z"]

    def run_cli(self, args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            fetch.main(args)
        return out.getvalue()

    def response_path(self):
        return next(self.raw.rglob("response.json"))

    def test_dry_run_is_narrow_and_never_authenticates_or_writes(self):
        out = self.run_cli(self.args + ["--dry-run"])
        self.assertIn("/class/gp_history/NORAD_CAT_ID/38023/EPOCH/", out)
        self.assertIn("2024-01-02T00%3A00%3A00--2024-01-05T00%3A00%3A00", out)
        self.assertIn("/orderby/EPOCH%20asc/format/json", out)
        self.session.assert_not_called()
        self.network.assert_not_called()
        self.assertFalse(self.raw.exists())

    def test_invalid_options_fail_before_authentication(self):
        invalid = [
            ["gp_history"], ["--norad-id", "38023"], ["satcat", "--norad-id", "38023"],
            ["gp_history", "--norad-id", "38023"], self.args + ["--force"],
            ["decay", "--norad-id", "0"], ["decay", "--norad-id", "1000000000"],
            ["decay", "--norad-id", "38023", "--start", "2024-01-01T00:00:00Z"],
            self.args + ["--start", "2024-01-01"],
            self.args + ["--start", "2024-01-02T00:00:00"],
            self.args + ["--end", "2024-01-01T00:00:00Z"],
            self.args + ["--end", "2024-02-01T00:00:00Z"],
        ]
        for args in invalid:
            with self.subTest(args=args), self.assertRaises(SystemExit) as error:
                self.run_cli(args)
            self.assertEqual(error.exception.code, 2)
        self.session.assert_not_called()

    def test_bytes_and_provenance_are_preserved(self):
        self.run_cli(self.args)
        path = self.response_path()
        self.assertEqual(path.read_bytes(), self.body)
        meta = json.loads(path.with_name("metadata.json").read_text())
        self.assertEqual(meta["sha256"], hashlib.sha256(self.body).hexdigest())
        self.assertEqual(meta["rowCount"], 1)
        self.assertIn("/class/gp_history/", meta["query"])
        self.assertTrue(meta["retrievedAt"].endswith("Z"))

    def test_repeat_uses_snapshot_without_authentication(self):
        self.run_cli(self.args)
        path = self.response_path()
        before = path.stat().st_mtime_ns
        self.session.reset_mock()
        self.network.reset_mock()
        self.assertIn("Using immutable snapshot", self.run_cli(self.args))
        self.assertEqual(path.stat().st_mtime_ns, before)
        self.session.assert_not_called()
        self.network.assert_not_called()

    def test_equivalent_timezone_bounds_reuse_same_snapshot(self):
        self.run_cli(self.args)
        self.session.reset_mock()
        args = self.args[:]
        args[4] = "2024-01-01T17:00:00-07:00"
        self.run_cli(args)
        self.session.assert_not_called()

    def test_empty_response_is_saved_and_not_retried(self):
        self.network.return_value = b"[]", []
        self.assertIn("No matching records", self.run_cli(self.args))
        self.session.reset_mock()
        self.run_cli(self.args)
        self.session.assert_not_called()

    def test_corrupt_snapshot_is_preserved_and_not_refetched(self):
        self.run_cli(self.args)
        path = self.response_path()
        path.write_bytes(b"[]")
        self.session.reset_mock()
        with self.assertRaisesRegex(ValueError, "corrupt snapshot"):
            self.run_cli(self.args)
        self.assertEqual(path.read_bytes(), b"[]")
        self.session.assert_not_called()

    def test_incomplete_snapshot_is_not_refetched(self):
        self.run_cli(self.args)
        self.response_path().with_name("metadata.json").unlink()
        self.session.reset_mock()
        with self.assertRaisesRegex(ValueError, "corrupt snapshot"):
            self.run_cli(self.args)
        self.session.assert_not_called()

    def test_existing_snapshot_is_never_overwritten(self):
        self.run_cli(self.args)
        path = self.response_path()
        meta = json.loads(path.with_name("metadata.json").read_text())
        with self.assertRaisesRegex(ValueError, "refusing to overwrite"):
            fetch.save_snapshot(path.parent, meta["query"], b"[]", [])
        self.assertEqual(path.read_bytes(), self.body)

    def test_wrong_object_or_out_of_window_epoch_is_not_saved(self):
        cases = [dict(self.rows[0], NORAD_CAT_ID="99999"),
                 dict(self.rows[0], EPOCH="2024-01-06T00:00:00"),
                 dict(self.rows[0], EPOCH="2024-01-04"),
                 dict(self.rows[0], EPOCH=None)]
        for row in cases:
            with self.subTest(row=row):
                self.network.return_value = json.dumps([row]).encode(), [row]
                with self.assertRaises(ValueError):
                    self.run_cli(self.args)
                self.assertFalse(self.raw.exists())

    def test_error_bodies_are_not_echoed_or_accepted(self):
        for body in [b'{"error": "private server message"}', b'not JSON', b'[1]', b'null']:
            with self.subTest(body=body), self.assertRaises(ValueError) as error:
                fetch.json_rows(body)
            self.assertNotIn("private server message", str(error.exception))

    def test_decay_request_keeps_original_epoch_and_only_historical_rows(self):
        rows = [{"NORAD_CAT_ID": "38023", "MSG_TYPE": "Historical",
                 "DECAY_EPOCH": "2024-01-05 00:00:00", "PRECEDENCE": "1"}]
        body = json.dumps(rows).encode()
        self.network.return_value = body, rows
        self.run_cli(["decay", "--norad-id", "38023"])
        self.assertEqual(self.response_path().read_bytes(), body)
        self.assertIn("/MSG_TYPE/Historical/", self.network.call_args.args[1])

    def test_prediction_is_not_accepted_as_historical_decay(self):
        rows = [{"NORAD_CAT_ID": "38023", "MSG_TYPE": "Prediction", "DECAY_EPOCH": "2024-01-05"}]
        self.network.return_value = json.dumps(rows).encode(), rows
        with self.assertRaises(ValueError):
            self.run_cli(["decay", "--norad-id", "38023"])
        self.assertFalse(self.raw.exists())

    def test_existing_bulk_decay_is_reused_unchanged(self):
        self.raw.mkdir(parents=True)
        source = self.raw / "decay.json"
        body = json.dumps([{"NORAD_CAT_ID": "38023", "MSG_TYPE": "Historical",
                            "DECAY_EPOCH": "2024-01-05 00:00:00"}]).encode()
        source.write_bytes(body)
        self.assertIn("no download", self.run_cli(["decay", "--norad-id", "38023"]))
        self.assertEqual(source.read_bytes(), body)
        self.session.assert_not_called()

    def test_default_commands_still_only_request_satcat_and_decay(self):
        out = self.run_cli(["--dry-run"])
        self.assertIn("/class/satcat/", out)
        self.assertIn("/class/decay/", out)
        self.assertNotIn("gp_history", out)

    def test_existing_24_hour_bulk_cache_still_skips_authentication(self):
        self.raw.mkdir(parents=True)
        for name in ("satcat", "decay"):
            (self.raw / f"{name}.json").write_text("[]")
        self.assertIn("Cache is fresh", self.run_cli([]))
        self.session.assert_not_called()


class SessionTests(unittest.TestCase):
    def test_real_fetch_helper_preserves_response_and_encodes_query(self):
        opener = mock.Mock()
        opener.open.return_value.__enter__ = mock.Mock(return_value=io.BytesIO(b"[]\n"))
        opener.open.return_value.__exit__ = mock.Mock(return_value=False)
        body, rows = fetch.fetch_json(opener, "/basicspacedata/query/class/decay/orderby/PRECEDENCE asc")
        self.assertEqual((body, rows), (b"[]\n", []))
        self.assertIn("PRECEDENCE%20asc", opener.open.call_args.args[0])

    def test_shared_session_logs_out_even_after_acquisition_failure(self):
        opener = mock.MagicMock()
        opener.open.return_value.__enter__.return_value.read.return_value = b'""'
        with mock.patch.object(fetch, "load_env", return_value=("test-user", "test-password")), \
                mock.patch.object(fetch.urllib.request, "build_opener", return_value=opener):
            with self.assertRaisesRegex(ValueError, "acquisition failed"):
                with fetch.authenticated_session() as active:
                    self.assertIs(active, opener)
                    raise ValueError("acquisition failed")
        self.assertEqual(opener.open.call_args_list[0].args[0], fetch.BASE + "/ajaxauth/login")
        self.assertEqual(opener.open.call_args_list[-1].args[0], fetch.BASE + "/ajaxauth/logout")


if __name__ == "__main__":
    unittest.main()
