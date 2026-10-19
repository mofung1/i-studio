"""Guard-only tests. Database calls and dumps are mocked; never executes cleanup."""
import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = str(Path(__file__).with_name('reset-ai-development.py'))

class ResetGuards(unittest.TestCase):
    def invoke(self, env, argv, counts=None):
        def response(command, **kwargs):
            self.assertNotIn('PGHOSTADDR', kwargs['env'])
            if 'json_build_object' in command[-1]:
                return json.dumps(counts or {'unsettled_charges': 0, 'active_tasks': 0})
            return 'reviewed foreign keys\n'
        with patch.dict(os.environ, env, clear=True), patch.object(sys, 'argv', [SCRIPT, *argv]), patch('subprocess.check_output', side_effect=response) as query, patch('subprocess.run') as mutate, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit) as exit_result:
                runpy.run_path(SCRIPT, run_name='__main__')
            mutate.assert_not_called()
            return str(exit_result.exception), query.call_count

    def test_nonlocal_or_ambiguous_url_is_rejected_before_connection(self):
        for url in ('', 'postgres://u@remote.example/db', 'postgres://u@127.0.0.1/db?hostaddr=10.0.0.1', 'postgres://u@127.0.0.1/db?service=production'):
            reason, calls = self.invoke({'DEV_AI_RESET_DATABASE_URL': url}, ['--backup-dir', '/private/tmp/unused-reset-backup'])
            self.assertIn('Refused', reason)
            self.assertEqual(calls, 0)

    def test_apply_requires_matching_development_confirmation(self):
        reason, calls = self.invoke({'DEV_AI_RESET_DATABASE_URL': 'postgres://u@127.0.0.1/dev'}, ['--backup-dir', '/private/tmp/unused-reset-backup', '--apply'])
        self.assertIn('requires APP_ENV=development', reason)
        self.assertEqual(calls, 0)

    def test_preview_cannot_write_or_dump(self):
        reason, calls = self.invoke({'DEV_AI_RESET_DATABASE_URL': 'postgres://u@127.0.0.1/dev', 'PGHOSTADDR': 'remote.invalid'}, ['--backup-dir', '/private/tmp/unused-reset-backup'])
        self.assertIn('Preview only', reason)
        self.assertEqual(calls, 2)

    def test_unsettled_tasks_prevent_backup_and_deletion(self):
        with tempfile.TemporaryDirectory() as temp:
            backup = str(Path(temp) / 'never-created')
            reason, calls = self.invoke({'DEV_AI_RESET_DATABASE_URL': 'postgres://u@127.0.0.1/dev', 'APP_ENV': 'development'}, ['--backup-dir', backup, '--apply', '--confirm-development', 'dev'], {'unsettled_charges': 1, 'active_tasks': 0})
            self.assertIn('reservations exist', reason)
            self.assertFalse(Path(backup).exists())
            self.assertEqual(calls, 2)

if __name__ == '__main__':
    unittest.main()
