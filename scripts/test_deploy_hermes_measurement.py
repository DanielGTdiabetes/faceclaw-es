"""Measurement deployment with the real S2.11 sources as synthetic production and a fake service."""
import contextlib
import importlib.util
import io
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


class MeasurementDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        base = Path(self.temp.name)
        spec = importlib.util.spec_from_file_location("measurement_deploy", REPO / "scripts/deploy-hermes-measurement.py")
        self.deploy = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.deploy)
        self.deploy.ROOT = base / "production"
        self.deploy.ROOT.mkdir()
        self.deploy.BACKUP = self.deploy.ROOT / "rollback"
        for name in ("conversation.py", "bridge.py", "daily_context.py"):
            # S2.11 as deployed by Codex: commit 5ecb2e5, conversation.py 417dc5c9.
            (self.deploy.ROOT / name).write_bytes(subprocess.check_output(
                ["git", "show", "5ecb2e5:integrations/hermes/" + name], cwd=REPO))
        self.candidate = base / "conversation.py"
        self.candidate.write_bytes((REPO / "integrations/hermes/conversation.py").read_bytes())
        self.ready = []
        self.deploy.restart_and_check = self.restart

    def restart(self):
        result = self.ready.pop(0) if self.ready else True
        if result is not True:
            raise RuntimeError(result)
        return 6.2

    def run_apply(self, *args, **kwargs):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.deploy.apply(*args, **kwargs)
        return out.getvalue()

    def live(self):
        return self.deploy.digest((self.deploy.ROOT / "conversation.py").read_bytes())

    def test_pins_match_the_repository(self):
        self.assertEqual(self.live(), self.deploy.OLD_HASH)
        self.assertEqual(self.deploy.digest(self.candidate.read_bytes()), self.deploy.NEW_HASH)
        for name, expected in self.deploy.FIXED.items():
            self.assertEqual(self.deploy.digest((REPO / "integrations/hermes" / name).read_bytes()), expected)

    def test_check_changes_nothing_then_apply_is_idempotent_and_rollback_restores(self):
        self.assertIn("CHECK_OK", self.run_apply(self.candidate, check=True))
        self.assertEqual(self.live(), self.deploy.OLD_HASH)
        self.assertFalse(self.deploy.BACKUP.exists())
        self.assertIn("MEASUREMENT_APPLIED=TRUE", self.run_apply(self.candidate))
        self.assertEqual(self.live(), self.deploy.NEW_HASH)
        self.assertEqual(oct(self.deploy.BACKUP.stat().st_mode & 0o777), "0o700")
        self.assertEqual(oct((self.deploy.BACKUP / "conversation.py").stat().st_mode & 0o777), "0o600")
        self.assertIn("ALREADY_APPLIED", self.run_apply(self.candidate))
        self.assertIn("ROLLED_BACK=TRUE", self.run_apply(rollback=True))
        self.assertEqual(self.live(), self.deploy.OLD_HASH)

    def test_failed_start_restores_previous_source(self):
        self.ready = ["Conversation channel failed to start", True]
        with self.assertRaises(SystemExit) as raised:
            self.run_apply(self.candidate)
        self.assertIn("Previous source and services restored", str(raised.exception))
        self.assertEqual(self.live(), self.deploy.OLD_HASH)

    def test_unreviewed_production_or_candidate_is_never_overwritten(self):
        (self.deploy.ROOT / "bridge.py").write_bytes(b"changed")
        with self.assertRaises(SystemExit):
            self.run_apply(self.candidate)
        self.assertEqual(self.live(), self.deploy.OLD_HASH)
        (self.deploy.ROOT / "bridge.py").write_bytes(subprocess.check_output(
            ["git", "show", "5ecb2e5:integrations/hermes/bridge.py"], cwd=REPO))
        self.candidate.write_bytes(b"print('other')")
        with self.assertRaises(SystemExit):
            self.run_apply(self.candidate)
        self.assertFalse(self.deploy.BACKUP.exists())


if __name__ == "__main__":
    unittest.main()
