"""Exercise reversible deploy in temporary directories; production source is read-only."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


class DeploymentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.candidate = Path(__file__).resolve().parent
        helper = cls.candidate / 'deploy-hermes-memory.py'
        if not helper.exists():
            helper = cls.candidate.parent.parent / 'scripts/deploy-hermes-memory.py'
        production = Path('/home/dani/faceclaw-hermes-bridge')
        if not helper.exists() or not production.exists():
            raise unittest.SkipTest('Run deploy simulations on Jarvis against the inspected original sources')
        spec = importlib.util.spec_from_file_location('memory_deploy_test', helper)
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)
        cls.original = {name: (production / name).read_bytes() for name in cls.module.HASHES}
        cls.desired = {name: (cls.candidate / name).read_bytes() for name in cls.module.HASHES}

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'root'
        self.root.mkdir()
        self.backup = self.root / 'backup'
        self.candidate_dir = Path(self.temp.name) / 'candidate'
        self.candidate_dir.mkdir()
        for name in self.original:
            (self.root / name).write_bytes(self.original[name])
            (self.candidate_dir / name).write_bytes(self.desired[name])
        self.patch = patch.multiple(self.module, ROOT=self.root, BACKUP=self.backup)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def current(self):
        return {name: (self.root / name).read_bytes() for name in self.original}

    def test_apply_idempotence_and_rollback(self):
        with patch.object(self.module, 'restart') as restart:
            self.module.apply(self.candidate_dir)
            self.assertEqual(self.current(), self.desired)
            self.module.apply(self.candidate_dir)
            self.assertEqual(restart.call_count, 1)
            self.module.apply(rollback=True)
            self.assertEqual(self.current(), self.original)
            self.module.apply(rollback=True)
            self.assertEqual(restart.call_count, 2)

    def test_changed_production_and_invalid_candidate_are_refused_before_writes(self):
        for target in (self.root, self.candidate_dir):
            path = target / 'conversation.py'
            baseline = path.read_bytes()
            path.write_bytes(b'Unexpected source')
            current = self.current()
            with patch.object(self.module, 'restart') as restart:
                with self.assertRaises(ValueError):
                    self.module.apply(self.candidate_dir)
                self.assertEqual(self.current(), current)
                restart.assert_not_called()
                self.assertFalse(self.backup.exists())
            path.write_bytes(baseline)

    def test_failed_restart_restores_original_files(self):
        with patch.object(self.module, 'restart', side_effect=[RuntimeError('Synthetic restart failure'), None]) as restart:
            with self.assertRaises(RuntimeError):
                self.module.apply(self.candidate_dir)
            self.assertEqual(self.current(), self.original)
            self.assertEqual(restart.call_count, 2)
