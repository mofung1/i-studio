"""Verify and prepare a reviewed handraw-style batch without overwriting library records."""

import argparse
import base64
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import re
import urllib.request

from PIL import Image


REPOSITORY = 'https://github.com/yang0/handraw-style'


def load_batch(path):
    batch = json.loads(path.read_text(encoding='utf-8'))
    if batch.get('sourceRepository') != REPOSITORY:
        raise ValueError('Unexpected source repository')
    if not re.fullmatch(r'[a-f0-9]{40}', batch['upstreamCommit']):
        raise ValueError('The source must be pinned to a commit')
    ids, images, prompts = set(), set(), set()
    for item in batch['items']:
        number = item['styleNumber']
        if not re.fullmatch(r'F[A-I]-\d{3}', number):
            raise ValueError('Invalid style number')
        if item['id'] != 'handraw-' + number.lower():
            raise ValueError('Invalid batch ID')
        if item['upstreamImage'] != f'images/individual/{number[:2]}/{number}.webp':
            raise ValueError('Invalid upstream image path')
        if not (0 < len(item['title']) <= 160 and 0 < len(item['category']) <= 80
                and 0 < len(item['prompt']) <= 20000 and len(item['source']) <= 500):
            raise ValueError('Invalid prompt fields')
        if 'yang0' not in item['source'] or REPOSITORY not in item['source']:
            raise ValueError('Author and repository attribution must be retained')
        if len(item['instructions']) > 1000:
            raise ValueError('Invalid usage instructions')
        if (item['id'] in ids or item['promptSha256'] in prompts
                or item['imageKey'] and item['imageKey'] in images):
            raise ValueError('Duplicate batch item')
        if hashlib.sha256(item['prompt'].encode()).hexdigest() != item['promptSha256']:
            raise ValueError('Prompt checksum mismatch')
        if item.get('coverStatus') == 'unavailable-upstream-mismatch':
            if (item['imageKey'] or item['width'] or item['height'] or item['imageBytes']
                    or not item.get('rejectedCover', {}).get('reason')):
                raise ValueError('A rejected cover must not be published')
        elif item.get('coverStatus') == 'verified-project-generation':
            generation = item.get('generationRecord', {})
            if (item.get('imageOrigin') != 'project-generation'
                    or not re.fullmatch(r'[a-f0-9]{64}', item.get('imageSha256', ''))
                    or item['imageKey'] != item['id'] + '-generated-' + item['imageSha256'][:10] + '.png'
                    or item.get('imageFormat') != 'PNG'
                    or not (0 < item['width'] and 0 < item['height'] and 0 < item['imageBytes'] <= 32000000)
                    or not generation.get('taskId') or not generation.get('prompt')
                    or generation.get('originalSha256') != item['imageSha256']
                    or generation.get('originalBytes') != item['imageBytes']):
                raise ValueError('Invalid project-generated cover metadata')
        elif (item.get('coverStatus') != 'verified-upstream'
              or item['imageKey'] != item['id'] + '.webp'
              or not (0 < item['width'] and 0 < item['height'] and 0 < item['imageBytes'] <= 8000000)):
            raise ValueError('Invalid cover metadata')
        if item['enabled'] is not True or not (-1000000 <= item['sortOrder'] <= 1000000):
            raise ValueError('Invalid publication settings')
        ids.add(item['id'])
        images.add(item['imageKey'])
        prompts.add(item['promptSha256'])
    return batch


def verify_cover(data, item):
    if len(data) != item['imageBytes'] or hashlib.sha256(data).hexdigest() != item['imageSha256']:
        raise ValueError(f"Cover checksum mismatch: {item['id']}")
    generated = item.get('imageOrigin') == 'project-generation'
    if not generated:
        blob = b'blob ' + str(len(data)).encode() + b'\0' + data
        if hashlib.sha1(blob).hexdigest() != item['upstreamImageBlob']:
            raise ValueError(f"Upstream blob mismatch: {item['id']}")
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        if image.format != ('PNG' if generated else 'WEBP') or image.size != (item['width'], item['height']):
            raise ValueError(f"Cover format or dimensions mismatch: {item['id']}")


def cover_key(item):
    if not item['imageKey']:
        return ''
    checksum = item['imageSha256']
    if not re.fullmatch(r'[a-f0-9]{64}', checksum):
        raise ValueError('Invalid image checksum')
    return 'inspiration/library/' + checksum + Path(item['imageKey']).suffix.lower()


def prepare_cover(batch, item, image_dir, download):
    if not item['imageKey']:
        return
    target = image_dir / cover_key(item).removeprefix('inspiration/')
    if target.exists():
        verify_cover(target.read_bytes(), item)
        return
    if not download or item.get('imageOrigin') == 'project-generation':
        raise FileNotFoundError(f'Missing cover: {target}')
    url = ('https://raw.githubusercontent.com/yang0/handraw-style/'
           f"{batch['upstreamCommit']}/{item['upstreamImage']}")
    request = urllib.request.Request(url, headers={'User-Agent': 'iStudio-reviewed-inspiration-import'})
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read(item['imageBytes'] + 1)
    verify_cover(data, item)
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        with target.open('xb') as cover:
            cover.write(data)
    except FileExistsError:
        verify_cover(target.read_bytes(), item)


def render_sql(batch, commit):
    rows = [{key: item[key] for key in (
        'id', 'title', 'category', 'prompt', 'source', 'imageKey',
        'width', 'height', 'sortOrder', 'enabled', 'instructions',
    )} for item in batch['items']]
    for row, item in zip(rows, batch['items']):
        row['imageKey'] = cover_key(item)
    payload = base64.b64encode(json.dumps(rows, ensure_ascii=False).encode()).decode()
    # COPY transmits data; prompt text is never interpolated into SQL or psql commands.
    sql = r"""\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='10s';
SELECT pg_advisory_xact_lock(724091025);
LOCK TABLE inspiration_categories,inspiration_prompts IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF COALESCE((SELECT active_profile FROM storage_settings WHERE id=true),'local') <> 'local' THEN
    RAISE EXCEPTION 'This batch uses local covers; active storage must be local';
  END IF;
END $$;
CREATE TEMP TABLE batch_before ON COMMIT DROP AS
  SELECT id,to_jsonb(p) AS original FROM inspiration_prompts p;
CREATE TEMP TABLE categories_before ON COMMIT DROP AS
  SELECT id,to_jsonb(c) AS original FROM inspiration_categories c;
CREATE TEMP TABLE batch_payload(encoded text) ON COMMIT DROP;
COPY batch_payload FROM STDIN;
""" + payload + r"""
\.
CREATE TEMP TABLE batch_rows ON COMMIT DROP AS
SELECT item.* FROM batch_payload,
  jsonb_to_recordset(convert_from(decode(encoded,'base64'),'UTF8')::jsonb)
  AS item(id text,title text,category text,prompt text,source text,"imageKey" text,
          width integer,height integer,"sortOrder" integer,enabled boolean,instructions text);
INSERT INTO inspiration_categories(id,name)
SELECT 'category_'||md5(category),category FROM batch_rows b
WHERE NOT EXISTS(SELECT 1 FROM inspiration_prompts p WHERE p.id=b.id)
GROUP BY category ON CONFLICT(name) DO NOTHING;
CREATE TEMP TABLE batch_inserted ON COMMIT DROP AS
WITH inserted AS (
  INSERT INTO inspiration_prompts
    (id,title,category,prompt,source,image_key,image_width,image_height,sort_order,enabled,instructions)
  SELECT id,title,category,prompt,source,"imageKey",width,height,"sortOrder",enabled,instructions
  FROM batch_rows WHERE true ON CONFLICT(id) DO NOTHING RETURNING id
) SELECT id FROM inserted;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM batch_before b LEFT JOIN inspiration_prompts p ON p.id=b.id
            WHERE p.id IS NULL OR to_jsonb(p)<>b.original) THEN
    RAISE EXCEPTION 'An existing prompt changed during the batch';
  END IF;
  IF EXISTS(SELECT 1 FROM categories_before b LEFT JOIN inspiration_categories c ON c.id=b.id
            WHERE c.id IS NULL OR to_jsonb(c)<>b.original) THEN
    RAISE EXCEPTION 'An existing category changed during the batch';
  END IF;
END $$;
SELECT jsonb_build_object('batchItems',(SELECT count(*) FROM batch_rows),
                         'inserted',(SELECT count(*) FROM batch_inserted),
                         'existingPreserved',(SELECT count(*) FROM batch_before),
                         'total',(SELECT count(*) FROM inspiration_prompts));
"""
    return sql + ('COMMIT;\n' if commit else 'ROLLBACK;\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--image-dir', type=Path, required=True)
    parser.add_argument('--output-sql', type=Path, required=True)
    parser.add_argument('--download', action='store_true', help='Download missing pinned covers')
    parser.add_argument('--commit', action='store_true', help='End generated SQL with COMMIT')
    args = parser.parse_args()
    batch = load_batch(args.manifest)
    if args.download:
        args.image_dir.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(lambda item: prepare_cover(batch, item, args.image_dir, args.download),
                          batch['items']))
    args.output_sql.write_text(render_sql(batch, args.commit), encoding='utf-8')
    print(json.dumps({'items': len(batch['items']),
                      'coversVerified': sum(bool(item['imageKey']) for item in batch['items']),
                      'transaction': 'COMMIT' if args.commit else 'ROLLBACK'}))


if __name__ == '__main__':
    main()
