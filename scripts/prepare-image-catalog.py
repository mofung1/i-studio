#!/usr/bin/env python3
"""Export only the public inspiration library for the distributable Docker image."""

import argparse
import hashlib
import json
from pathlib import Path
import re
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
    images = sorted({p['image_key'] for p in catalog['prompts'] if p['image_key']})
    for key in images:
        if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(jpg|jpeg|png|webp)', key):
            raise ValueError('Only reviewed local public covers can be bundled: ' + key)
        path = image_dir / key
        if path.is_symlink() or not path.is_file():
            raise ValueError('Missing or symlinked public cover: ' + key)
        data = path.read_bytes()
        catalog['files'].append({'key': key, 'bytes': len(data),
                                 'sha256': hashlib.sha256(data).hexdigest()})
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
