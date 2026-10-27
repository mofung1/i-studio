#!/usr/bin/env python3
"""Exercise a Docker image in a disposable Compose project, without paid AI calls."""

import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', default='istudio:local')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    catalog = json.loads((ROOT / 'server/seed/inspiration-catalog.json').read_text())
    project = 'istudio-smoke-' + secrets.token_hex(4)
    with tempfile.TemporaryDirectory(prefix='istudio-smoke-') as temporary:
        composefile = Path(temporary) / 'compose.yml'
        exported = subprocess.check_output(['docker', 'run', '--rm', args.image, 'compose'], text=True)
        assert exported == (ROOT / 'compose.yml').read_text(), 'Image has an outdated Compose file'
        composefile.write_text(exported)
        generated = subprocess.check_output(['docker', 'run', '--rm', args.image, 'setup', args.image], text=True)
        setup = dict(line.split('=', 1) for line in generated.splitlines() if '=' in line)
        assert setup['ISTUDIO_IMAGE'] == args.image
        assert len(setup['POSTGRES_PASSWORD']) == 64 and len(setup['ADMIN_PASSWORD']) == 48
        envfile = Path(temporary) / '.env'
        password, admin_password = setup['POSTGRES_PASSWORD'], setup['ADMIN_PASSWORD']
        envfile.write_text(f'ISTUDIO_IMAGE={args.image}\nWEB_PORT=0\nBIND_ADDRESS=127.0.0.1\n'
                           f'POSTGRES_PASSWORD={password}\nADMIN_USERNAME=admin\nADMIN_PASSWORD={admin_password}\n')
        envfile.chmod(0o600)
        compose = ['docker', 'compose', '-p', project, '--env-file', str(envfile), '-f', str(composefile)]

        def run(*command, check=True):
            result = subprocess.run([*compose, *command], text=True, capture_output=True, cwd=ROOT)
            if check and result.returncode:
                raise RuntimeError('Compose command failed: ' + ' '.join(command) + '\n' + result.stderr)
            return result.stdout.strip()

        def sql(query):
            return run('exec', '-T', 'postgres', 'psql', '-XqAt', '-U', 'istudio', '-d', 'istudio',
                       '-v', 'ON_ERROR_STOP=1', '-c', query)

        try:
            run('up', '-d', '--wait', '--wait-timeout', '180', '--pull', 'missing')
            port = run('port', 'app', '8080').rsplit(':', 1)[1]
            base = 'http://127.0.0.1:' + port

            def request(path, payload=None, token=None, method=None):
                headers = {'Content-Type': 'application/json'} if payload is not None else {}
                if token:
                    headers['Authorization'] = 'Bearer ' + token
                req = urllib.request.Request(base + path,
                    data=json.dumps(payload).encode() if payload is not None else None,
                    headers=headers, method=method)
                with urllib.request.urlopen(req, timeout=20) as response:
                    return response.status, response.headers, response.read()

            pages = ['/', '/studio', '/inspiration', '/admin/login', '/robots.txt', '/sitemap.xml']
            for path in pages:
                assert request(path)[0] == 200, path
            assert b'Disallow: /' in request('/robots.txt')[2]
            assert request('/v1/health')[0] == 200
            credentials = {'username': 'admin', 'password': admin_password}
            login = json.loads(request('/v1/admin/auth/login', credentials)[2])
            token = login['accessToken']
            assert request('/v1/admin/auth/me', token=token)[0] == 200

            expected = {p['id']: p for p in catalog['prompts'] if p['enabled']}
            first = json.loads(request('/v1/inspiration/prompts?pageSize=60')[2])
            records = list(first['prompts'])
            for page in range(2, (first['total'] + 59) // 60 + 1):
                records += json.loads(request(f'/v1/inspiration/prompts?pageSize=60&page={page}')[2])['prompts']
            assert first['total'] == len(expected)
            assert {p['id'] for p in records} == set(expected)
            for record in records:
                item = expected[record['id']]
                for field in ('title', 'category', 'prompt', 'source'):
                    assert record[field] == item[field], (record['id'], field)
            files = {f['key']: f for f in catalog['files']}

            def verify_cover(record):
                item = expected[record['id']]
                if not item['image_key']:
                    assert not record['imageUrl']
                    return 0
                status, headers, data = request(record['imageUrl'])
                file = files[item['image_key']]
                assert status == 200 and headers.get_content_type().startswith('image/')
                assert len(data) == file['bytes'] and hashlib.sha256(data).hexdigest() == file['sha256']
                return 1

            with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
                covers = sum(executor.map(verify_cover, records))
            private = json.loads(sql("SELECT jsonb_build_object('users',(SELECT count(*) FROM users),"
                "'administrators',(SELECT count(*) FROM admin_users),'assets',(SELECT count(*) FROM assets),"
                "'generationTasks',(SELECT count(*) FROM generation_tasks),'aiEndpoints',(SELECT count(*) FROM ai_endpoints));"))
            assert private == {'users': 0, 'administrators': 1, 'assets': 0, 'generationTasks': 0, 'aiEndpoints': 0}
            key_hash = run('exec', '-T', 'app', 'node', '-e',
                "const f=require('fs'),c=require('crypto');process.stdout.write(c.createHash('sha256').update(f.readFileSync('/data/uploads/.auth/signing.key')).digest('hex'))")

            changed, deleted = sorted(expected)[:2]
            # IDs come from our versioned catalog, and SQL string data is escaped explicitly.
            quote = lambda value: "'" + value.replace("'", "''") + "'"
            sql('UPDATE inspiration_prompts SET title=\'smoke custom title\' WHERE id=' + quote(changed) + ';'
                'DELETE FROM inspiration_prompts WHERE id=' + quote(deleted) + ';')
            run('up', '-d', '--force-recreate', '--no-deps', '--wait', '--wait-timeout', '120', 'app')
            # Host port 0 gets a new mapping after recreation.
            base = 'http://127.0.0.1:' + run('port', 'app', '8080').rsplit(':', 1)[1]
            assert sql('SELECT title FROM inspiration_prompts WHERE id=' + quote(changed)) == 'smoke custom title'
            assert sql('SELECT count(*) FROM inspiration_prompts WHERE id=' + quote(deleted)) == '0'
            assert sql('SELECT count(*) FROM installation_seeds') == '1'
            assert run('exec', '-T', 'app', 'node', '-e',
                "const f=require('fs'),c=require('crypto');process.stdout.write(c.createHash('sha256').update(f.readFileSync('/data/uploads/.auth/signing.key')).digest('hex'))") == key_hash
            assert request('/v1/admin/auth/me', token=token)[0] == 200

            # A lost API must restart the entire application, not leave a healthy-looking web process.
            container = run('ps', '-q', 'app')
            old_restarts = int(subprocess.check_output(['docker', 'inspect', '--format', '{{.RestartCount}}', container], text=True))
            run('exec', '-T', 'app', 'node', '-e',
                "const f=require('fs');for(const p of f.readdirSync('/proc')){if(!/^\\d+$/.test(p))continue;try{const s=f.readFileSync('/proc/'+p+'/cmdline','utf8');if(s.split('\\0')[0]==='istudio-server'){process.kill(Number(p),'SIGKILL');break}}catch{}}", check=False)
            recovered = False
            for _ in range(45):
                time.sleep(1)
                state = json.loads(subprocess.check_output(['docker', 'inspect', '--format', '{{json .State}}', container], text=True))
                restarts = int(subprocess.check_output(['docker', 'inspect', '--format', '{{.RestartCount}}', container], text=True))
                if restarts > old_restarts and state.get('Health', {}).get('Status') == 'healthy':
                    recovered = True
                    break
            assert recovered, 'Application did not recover after the API exited'
            base = 'http://127.0.0.1:' + run('port', 'app', '8080').rsplit(':', 1)[1]
            assert request('/v1/health')[0] == 200
            image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', args.image], text=True))[0]
            report = {'image': args.image, 'imageId': image['Id'], 'architecture': image['Architecture'],
                      'imageBytes': image['Size'], 'pagesVerified': pages, 'publicPrompts': len(records),
                      'publicCovers': covers, 'freshPrivateData': private, 'editedAndDeletedPromptsPreserved': True,
                      'signingKeyAndLoginSurviveRecreation': True, 'apiFailureRestartsApplication': True}
            if args.report:
                args.report.parent.mkdir(parents=True, exist_ok=True)
                args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
            print(json.dumps(report, ensure_ascii=False))
        except Exception:
            print(run('logs', '--tail', '30', 'app', check=False))
            raise
        finally:
            # This uniquely named project's volumes contain only the synthetic data created above.
            run('down', '--volumes', '--remove-orphans', check=False)


if __name__ == '__main__':
    main()
