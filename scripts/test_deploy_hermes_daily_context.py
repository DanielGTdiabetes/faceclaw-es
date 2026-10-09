"""Exercise deployment/recovery with synthetic stores and a fake systemctl."""
import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import sqlite3
import tempfile
import unittest


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        repo = Path(__file__).resolve().parent.parent
        self.temp = tempfile.TemporaryDirectory(dir=repo / '.tools')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        spec = importlib.util.spec_from_file_location('daily_deploy', repo / 'scripts/deploy-hermes-daily-context.py')
        self.deploy = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.deploy)
        self.deploy.ROOT = self.base / 'production'
        self.deploy.ROOT.mkdir()
        self.deploy.BACKUP = self.deploy.ROOT / 'rollback'
        self.deploy.DROPIN = self.base / 'config/60-daily-context.conf'
        self.deploy.STORE = self.base / 'cache/topics.sqlite3'
        self.candidate = self.base / 'candidate'
        self.candidate.mkdir()
        for name, (old_hash, _) in self.deploy.HASHES.items():
            if old_hash:
                # The rollback fixture is the pre-deployment revision, not the
                # moving HEAD (which contains the candidate after publication).
                old = subprocess.check_output(['git', 'show', '6395abd:integrations/hermes/' + name], cwd=repo)
                self.assertEqual(self.deploy.digest(old), old_hash)
                (self.deploy.ROOT / name).write_bytes(old)
            (self.candidate / name).write_bytes((repo / 'integrations/hermes' / name).read_bytes())
        self.restarts = 0
        self.deploy.restart = self.restart

    def restart(self):
        self.restarts += 1

    def apply(self, **kwargs):
        with contextlib.redirect_stdout(io.StringIO()):
            self.deploy.apply(self.candidate, **kwargs)

    def test_apply_idempotence_and_rollback_restore_exact_previous_files(self):
        self.apply()
        self.assertEqual(self.restarts, 1)
        self.apply()
        self.assertEqual(self.restarts, 1)
        self.assertEqual(self.deploy.DROPIN.read_bytes(), self.deploy.config_bytes())
        self.apply(rollback=True)
        for name, (old_hash, _) in self.deploy.HASHES.items():
            self.assertEqual(self.deploy.digest(self.deploy.read_optional(self.deploy.ROOT / name)), old_hash)
        self.assertFalse(self.deploy.DROPIN.exists())
        self.assertEqual(self.restarts, 2)

    def test_unreviewed_source_or_configuration_is_never_overwritten(self):
        (self.deploy.ROOT / 'bridge.py').write_bytes(b'changed production')
        with self.assertRaises(ValueError):
            self.apply()
        self.assertEqual(self.restarts, 0)
        self.assertFalse(self.deploy.BACKUP.exists())

    def test_existing_dropin_is_preserved(self):
        self.deploy.DROPIN.parent.mkdir()
        self.deploy.DROPIN.write_bytes(b'preexisting configuration')
        with self.assertRaises(ValueError):
            self.apply()
        self.assertEqual(self.deploy.DROPIN.read_bytes(), b'preexisting configuration')
        self.assertEqual(self.restarts, 0)

    def test_failed_restart_recovers_previous_sources_and_configuration(self):
        def fail_once():
            self.restarts += 1
            if self.restarts == 1:
                raise RuntimeError('synthetic restart failure')
        self.deploy.restart = fail_once
        with self.assertRaises(RuntimeError):
            self.apply()
        self.assertEqual(self.restarts, 2)
        self.assertFalse(self.deploy.DROPIN.exists())
        for name, (old_hash, _) in self.deploy.HASHES.items():
            self.assertEqual(self.deploy.digest(self.deploy.read_optional(self.deploy.ROOT / name)), old_hash)

    def test_unowned_atomic_temp_file_is_not_deleted(self):
        target = self.deploy.ROOT / 'bridge.py'
        temp = target.with_name(target.name + '.daily-context.tmp')
        temp.write_bytes(b'other deployment')
        with self.assertRaises(FileExistsError):
            self.deploy.write_atomic(target, b'new')
        self.assertEqual(temp.read_bytes(), b'other deployment')

    def test_rollback_clears_summaries_before_removing_ttl_worker(self):
        self.apply()
        spec = importlib.util.spec_from_file_location('memory_seed', self.deploy.ROOT / 'daily_context.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        memory = module.DailyContext(self.deploy.STORE)
        generation = memory.snapshot('')[0]
        self.assertTrue(memory.remember({'topicId': None, 'topic': 'Sintético',
            'summary': 'Dato sintético para comprobar borrado.', 'evidenceSeqs': [1]},
            generation=generation, evidence_seqs={1}))
        memory.close()
        self.apply(rollback=True)
        with contextlib.closing(sqlite3.connect(self.deploy.STORE)) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM topics').fetchone()[0], 0)


if __name__ == '__main__':
    unittest.main()
