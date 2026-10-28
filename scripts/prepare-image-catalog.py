#!/usr/bin/env python3
"""Export only the public inspiration library for the distributable Docker image."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

PROJECT = Path(__file__).resolve().parents[1]
PROMPT_FIELDS = (
    'id', 'title', 'category', 'prompt', 'source', 'image_key', 'image_width',
    'image_height', 'enabled', 'sort_order', 'instructions', 'requires_reference',
)
SQL = """BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT jsonb_build_object('version',1,
 'categories',COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM
   (SELECT id,name FROM inspiration_categories ORDER BY id) c),'[]'::jsonb),
 'prompts',COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM
   (SELECT id,title,category,prompt,source,image_key,image_width,image_height,enabled,
           sort_order,instructions,requires_reference
    FROM inspiration_prompts ORDER BY sort_order,id) p),'[]'::jsonb));
COMMIT;
"""


def prepare(snapshot, image_dir):
    catalog = {'version': 1,
               'categories': [{k: c[k] for k in ('id', 'name')} for c in snapshot['categories']],
               'prompts': [{k: p[k] for k in PROMPT_FIELDS} for p in snapshot['prompts']],
               'files': []}
    if not catalog['categories'] or not catalog['prompts']:
        raise ValueError('The public library is empty')
    files = {}
    for prompt in catalog['prompts']:
        key = prompt['image_key']
        if not key:
            continue
        if not re.fullmatch(r'(?:[a-zA-Z0-9][a-zA-Z0-9_.-]*|inspiration/library/[a-f0-9]{64})\.(jpg|jpeg|png|webp)', key):
            raise ValueError('Only reviewed local public covers can be bundled: ' + key)
        path = image_dir / key.removeprefix('inspiration/')
        if path.is_symlink() or not path.is_file():
            raise ValueError('Missing or symlinked public cover: ' + key)
        data = path.read_bytes()
        checksum = hashlib.sha256(data).hexdigest()
        canonical = 'inspiration/library/' + checksum + path.suffix.lower()
        target = image_dir / canonical.removeprefix('inspiration/')
        if target.is_symlink():
            raise ValueError('Symlinked canonical cover: ' + canonical)
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
        if hashlib.sha256(target.read_bytes()).hexdigest() != checksum:
            raise ValueError('Canonical cover checksum mismatch: ' + canonical)
        prompt['image_key'] = canonical
        files[canonical] = {'key': canonical, 'bytes': len(data), 'sha256': checksum}
    catalog['files'] = [files[k] for k in sorted(files)]
    return catalog


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, help='Use a previously exported public JSON snapshot')
    parser.add_argument('--output', type=Path, default=PROJECT / 'server/seed/inspiration-catalog.json')
    parser.add_argument('--image-dir', type=Path, default=PROJECT / 'server/storage/uploads/inspiration')
    parser.add_argument('--compose-file', type=Path, default=PROJECT / 'docker/docker-compose.yml')
    args = parser.parse_args()
    if args.snapshot:
        snapshot = json.loads(args.snapshot.read_text(encoding='utf-8'))
    else:
        command = ['docker', 'compose', '-f', str(args.compose_file), 'exec', '-T',
                   'postgres', 'psql', '-XqAt', '-U', 'istudio', '-d', 'istudio',
                   '-v', 'ON_ERROR_STOP=1']
        result = subprocess.run(command, input=SQL, text=True, capture_output=True)
        if result.returncode:
            raise SystemExit('Unable to read the public library; check the source PostgreSQL service')
        snapshot = json.loads(result.stdout)
    catalog = prepare(snapshot, args.image_dir)
    args.output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'prompts': len(catalog['prompts']), 'categories': len(catalog['categories']),
                      'covers': len(catalog['files']), 'output': str(args.output)}))


if __name__ == '__main__':
    main()
