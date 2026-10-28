#!/usr/bin/env python3
"""Normalize reviewed public covers to inspiration/library/<sha256>.<ext>."""

import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

PROJECT = Path(__file__).resolve().parents[1]


def plan(rows, root):
    changes, files = [], {}
    for row in rows:
        old = row['image_key']
        if not old:
            continue
        if not re.fullmatch(r'(?:[a-zA-Z0-9][a-zA-Z0-9_.-]*|inspiration/library/[a-f0-9]{64})\.(jpg|jpeg|png|webp)', old):
            # Published community covers have a separate lifecycle.
            raise ValueError('Unsupported cover; review before migration: ' + old)
        source = root / (old if old.startswith('inspiration/') else 'inspiration/' + old)
        if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(root.resolve()):
            raise ValueError('Missing or unsafe cover: ' + old)
        checksum = hashlib.sha256(source.read_bytes()).hexdigest()
        key = 'inspiration/library/' + checksum + source.suffix.lower()
        files[key] = {'source': str(source), 'key': key, 'sha256': checksum}
        if old != key:
            changes.append({'id': row['id'], 'old': old, 'new': key, 'source': str(source)})
    return changes, files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--storage-root', type=Path, default=PROJECT / 'server/storage/uploads')
    parser.add_argument('--container', default='i-studio-postgres-1')
    parser.add_argument('--database', default='istudio')
    parser.add_argument('--backup-dir', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    def sql(query):
        return subprocess.check_output(['docker', 'exec', '-i', args.container, 'psql', '-XqAt',
                                       '-U', 'istudio', '-d', args.database, '-v', 'ON_ERROR_STOP=1'],
                                      input=query, text=True)

    rows = json.loads(sql("SELECT coalesce(json_agg(x),'[]') FROM (SELECT id,image_key FROM inspiration_prompts ORDER BY id) x;"))
    changes, files = plan(rows, args.storage_root)
    print(json.dumps({'prompts': len(rows), 'changes': len(changes), 'uniqueCovers': len(files), 'apply': args.apply}))
    if not args.apply:
        return
    if not args.backup_dir or args.backup_dir.resolve().is_relative_to(args.storage_root.resolve()):
        raise ValueError('Provide a new backup directory outside uploads')
    args.backup_dir.mkdir(parents=True, exist_ok=False)
    (args.backup_dir / 'path-mapping.json').write_text(json.dumps(changes, ensure_ascii=False, indent=2))
    backup = args.backup_dir / 'inspiration-before.sql'
    with backup.open('wb') as out:
        backup.chmod(0o600)
        subprocess.run(['docker', 'exec', args.container, 'pg_dump', '-U', 'istudio', '-d', args.database,
                        '-t', 'inspiration_prompts', '-t', 'inspiration_categories'], stdout=out, check=True)
    for item in files.values():
        target = args.storage_root / item['key']
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.is_symlink():
            raise ValueError('Unsafe destination: ' + str(target))
        if not target.exists():
            shutil.copy2(item['source'], target)
        if hashlib.sha256(target.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('Destination checksum mismatch: ' + str(target))
    payload = base64.b64encode(json.dumps(changes).encode()).decode()
    sql("BEGIN; SELECT pg_advisory_xact_lock(724091025); "
        "CREATE TEMP TABLE cover_path_changes ON COMMIT DROP AS SELECT * FROM jsonb_to_recordset("
        "convert_from(decode('" + payload + "','base64'),'UTF8')::jsonb) AS x(id text, old text, new text, source text); "
        "DO $$ BEGIN IF (SELECT count(*) FROM inspiration_prompts p JOIN cover_path_changes c ON p.id=c.id AND p.image_key=c.old)"
        " <> (SELECT count(*) FROM cover_path_changes) THEN RAISE EXCEPTION 'Cover references changed; retry from a fresh snapshot'; END IF; END $$; "
        "UPDATE inspiration_prompts p SET image_key=c.new FROM cover_path_changes c WHERE p.id=c.id AND p.image_key=c.old; COMMIT;")
    archived = args.backup_dir / 'original-images'
    for source in {item['source'] for item in changes}:
        p = Path(source)
        if p in {args.storage_root / key for key in files}:
            continue
        destination = archived / p.relative_to(args.storage_root)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(p, destination)
    print('Database references updated; original filenames archived; canonical images retained.')


if __name__ == '__main__':
    main()
