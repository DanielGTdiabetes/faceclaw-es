"""Temporary-directory deployment simulations, no production access or providers."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


class GatekeeperMetricsDeploymentTests(unittest.TestCase):
    def setUp(self):
        helper = Path(__file__).resolve().parent.parent.parent / 'scripts/deploy-hermes-gatekeeper-metrics.py'
        if not helper.exists():
            helper = Path(__file__).resolve().parent / helper.name
        spec = importlib.util.spec_from_file_location('gatekeeper_metrics_deploy', helper)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.production = root / 'production'
        self.candidate = root / 'candidate'
        self.production.mkdir()
        self.candidate.mkdir()
        self.previous = b'VALUE = 1\n'
        self.desired = b'VALUE = 2\n'
        (self.production / 'conversation.py').write_bytes(self.previous)
        (self.candidate / 'conversation.py').write_bytes(self.desired)
        self.module.ROOT = self.production
        self.module.BACKUP = root / 'backup'
        self.module.HASHES = {'conversation.py': (self.module.digest(self.previous), self.module.digest(self.desired))}

    def current(self):
        return (self.production / 'conversation.py').read_bytes()

    def test_apply_idempotence_and_rollback(self):
        with patch.object(self.module, 'restart') as restart:
            self.module.apply(self.candidate)
            self.assertEqual(self.current(), self.desired)
            self.module.apply(self.candidate)
            self.assertEqual(restart.call_count, 1)
            self.module.apply(rollback=True)
            self.assertEqual(self.current(), self.previous)
            self.module.apply(rollback=True)
            self.assertEqual(restart.call_count, 2)

    def test_changed_production_is_refused_before_writes(self):
        (self.production / 'conversation.py').write_bytes(b'UNRELATED = 3\n')
        with patch.object(self.module, 'restart') as restart:
            with self.assertRaises(ValueError):
                self.module.apply(self.candidate)
            restart.assert_not_called()
        self.assertEqual(self.current(), b'UNRELATED = 3\n')
        self.assertFalse(self.module.BACKUP.exists())

    def test_invalid_candidate_is_refused_before_backup(self):
        (self.candidate / 'conversation.py').write_bytes(b'INVALID\n')
        with self.assertRaises(ValueError):
            self.module.apply(self.candidate)
        self.assertEqual(self.current(), self.previous)
        self.assertFalse(self.module.BACKUP.exists())

    def test_restart_failure_restores_previous_source(self):
        with patch.object(self.module, 'restart', side_effect=[RuntimeError('failed'), None]) as restart:
            with self.assertRaises(RuntimeError):
                self.module.apply(self.candidate)
            self.assertEqual(restart.call_count, 2)
        self.assertEqual(self.current(), self.previous)


if __name__ == '__main__':
    unittest.main()
