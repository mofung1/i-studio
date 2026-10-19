#!/usr/bin/env python3
"""Explicit local-only AI configuration reset. Never called by startup/build/tests."""
import argparse
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import parse_qs, urlparse

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true', help='perform the reviewed reset after backup')
parser.add_argument('--confirm-development', default='', help='exact local development database name')
parser.add_argument('--backup-dir', required=True, type=Path)
args = parser.parse_args()
raw = os.environ.get('DEV_AI_RESET_DATABASE_URL', '')
url = urlparse(raw)
if (url.scheme not in ('postgres', 'postgresql') or
        url.hostname not in ('127.0.0.1', 'localhost', '::1') or
        not url.path.strip('/') or set(parse_qs(url.query)) - {'sslmode'}):
    sys.exit('Refused: explicitly set DEV_AI_RESET_DATABASE_URL to a local PostgreSQL database (no host/options overrides).')
dbname = url.path.strip('/')
if args.apply and (os.environ.get('APP_ENV') != 'development' or args.confirm_development != dbname):
    sys.exit('Refused: --apply requires APP_ENV=development and --confirm-development matching the database name.')
env = dict(os.environ, PGDATABASE=raw, PGOPTIONS='-c search_path=public')
# Ignore inherited libpq routing/option overrides; only the explicit URL chooses the target.
for key in ('PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGSERVICE', 'PGSERVICEFILE'):
    env.pop(key, None)

def psql(query):
    return subprocess.check_output(['psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', query], env=env, text=True)

print('Target: local database', dbname)
print('Stop the API and all workers before applying this script.')
print('Deletes: all public_model_channels, all public_models, image-purpose ai_endpoints;')
print('         only terminal generation tasks without assets, and their settled charges.')
print('Clears: private provider snapshots of remaining settled charges (billing history retained).')
print('Preserves: users/auth, credit accounts/ledger, uploaded/generated assets and objects,')
print('           projects, settings, prompt endpoints/templates, reverse jobs, storage configuration, migration records.')
fks = psql("""SELECT conrelid::regclass||' -> '||confrelid::regclass||': '||pg_get_constraintdef(oid)
FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY conrelid::regclass::text""")
print('Foreign keys:\n' + fks)
counts = psql("""SELECT json_build_object(
'bindings',(SELECT count(*) FROM public_model_channels),
'public_models',(SELECT count(*) FROM public_models),
'image_endpoints',(SELECT count(*) FROM ai_endpoints WHERE purpose='image'),
'empty_terminal_tasks',(SELECT count(*) FROM generation_tasks t WHERE status NOT IN ('queued','processing','waiting_provider') AND NOT EXISTS(SELECT 1 FROM assets a WHERE a.task_id=t.id)),
'unsettled_charges',(SELECT count(*) FROM generation_charges WHERE NOT settled),
'active_tasks',(SELECT count(*) FROM generation_tasks WHERE status IN ('queued','processing','waiting_provider')))
""")
print('Scope counts:', counts.strip())
if not args.apply:
    sys.exit('Preview only. No data changed. Use --apply with explicit development confirmation after review.')
state = json.loads(counts)
if state['unsettled_charges'] or state['active_tasks']:
    sys.exit('Refused: active tasks/unsettled reservations exist. Finish or recover and settle them before resetting.')
args.backup_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = args.backup_dir / ('ai-reset-' + stamp)
backup.mkdir(mode=0o700)
(backup / 'foreign-keys.txt').write_text(fks)
(backup / 'scope.json').write_text(counts)
# Back up structure first and scoped data before any mutations.
for filename, options in [
    ('schema.sql', ['--schema-only']),
    ('ai-data.sql', ['--data-only', '--column-inserts', '--table=public.public_models',
                     '--table=public.public_model_channels', '--table=public.ai_endpoints',
                     '--table=public.generation_tasks', '--table=public.generation_charges']),
]:
    path = backup / filename
    with path.open('x') as output:
        os.chmod(path, 0o600)
        subprocess.run(['pg_dump', '--no-owner', '--no-acl', *options], env=env, stdout=output, check=True)
print('Backup saved:', backup)
# Recheck after exclusive table locks. No CASCADE: unexpected dependencies fail closed.
psql("""BEGIN;
SELECT pg_advisory_xact_lock(79140001);
SELECT pg_advisory_xact_lock(724091024);
LOCK TABLE generation_tasks,generation_charges,assets,public_models,public_model_channels,ai_endpoints IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM generation_charges WHERE NOT settled) OR
    EXISTS(SELECT 1 FROM generation_tasks WHERE status IN ('queued','processing','waiting_provider')) THEN
  RAISE EXCEPTION 'Active tasks or reservations appeared; reset aborted';
 END IF;
END $$;
CREATE TEMP TABLE reset_task_ids ON COMMIT DROP AS
 SELECT id FROM generation_tasks t WHERE NOT EXISTS(SELECT 1 FROM assets a WHERE a.task_id=t.id);
DELETE FROM generation_charges WHERE settled AND task_id IN (SELECT id FROM reset_task_ids);
DELETE FROM generation_tasks WHERE id IN (SELECT id FROM reset_task_ids);
UPDATE generation_charges SET provider_snapshot='{}'::jsonb WHERE settled;
DELETE FROM public_model_channels;
DELETE FROM public_models;
DELETE FROM ai_endpoints WHERE purpose='image';
COMMIT;""")
print('Development AI reset complete. No wallet balances or object files changed.')
