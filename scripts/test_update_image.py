"""Exercise the publisher with a fake Docker executable; never build or push images."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / 'update-image.sh'
FAKE_DOCKER = '''
import json
import os
import sys

args = sys.argv[1:]
with open(os.environ['ISTUDIO_TEST_DOCKER_LOG'], 'a') as log:
    log.write(json.dumps(args) + '\\n')
if args == ['info'] and os.environ.get('ISTUDIO_TEST_FAIL') == 'daemon':
    sys.exit(17)
if args[:2] == ['buildx', 'inspect']:
    if '--bootstrap' in args:
        if os.environ.get('ISTUDIO_TEST_FAIL') == 'bootstrap':
            sys.exit(17)
    elif os.environ.get('ISTUDIO_TEST_BUILDER_EXISTS', '1') != '1':
        sys.exit(1)
if args[:2] == ['buildx', 'build'] and os.environ.get('ISTUDIO_TEST_FAIL') == 'build':
    sys.exit(17)
'''


class UpdateImageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='istudio image test ')
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.project = self.directory / 'project with spaces'
        (self.project / 'docker').mkdir(parents=True)
        (self.project / 'docker/image.Dockerfile').touch()
        self.script = self.project / 'update-image.sh'
        shutil.copy2(SCRIPT, self.script)
        self.bin = self.directory / 'fake bin'
        self.bin.mkdir()
        docker = self.bin / 'docker'
        docker.write_text(f'#!{sys.executable}\n' + FAKE_DOCKER)
        docker.chmod(0o755)
        self.log = self.directory / 'docker.jsonl'

    def invoke(self, *arguments, **environment):
        self.log.unlink(missing_ok=True)
        result = subprocess.run(
            ['bash', str(self.script), *arguments],
            cwd=self.directory,
            env={
                **os.environ,
                'PATH': str(self.bin) + os.pathsep + os.environ.get('PATH', ''),
                'ISTUDIO_TEST_DOCKER_LOG': str(self.log),
                **environment,
            },
            text=True,
            capture_output=True,
        )
        self.calls = [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []
        return result

    def build(self):
        return next(call for call in self.calls if call[:2] == ['buildx', 'build'])

    def test_default_publishes_both_architectures_from_the_script_directory(self):
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        build = self.build()
        self.assertEqual(build[build.index('--tag') + 1], 'mofugn1/istudio:latest')
        self.assertEqual(build[build.index('--platform') + 1], 'linux/amd64,linux/arm64')
        self.assertEqual(build[build.index('--file') + 1], str(self.project / 'docker/image.Dockerfile'))
        self.assertEqual(build[-1], str(self.project))
        self.assertIn('--push', build)
        self.assertNotIn('--load', build)
        self.assertIn('镜像已推送', result.stdout)
        self.assertFalse(any(call[0] in ('compose', 'login') for call in self.calls))

    def test_creates_a_missing_builder_without_changing_the_selected_builder(self):
        result = self.invoke(ISTUDIO_TEST_BUILDER_EXISTS='0')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(['buildx', 'create', '--name', 'istudio-image', '--driver', 'docker-container'], self.calls)
        self.assertIn(['buildx', 'inspect', 'istudio-image', '--bootstrap'], self.calls)
        self.assertFalse(any('--use' in call for call in self.calls))

    def test_reuses_an_existing_builder(self):
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any(call[:2] == ['buildx', 'create'] for call in self.calls))

    def test_custom_repository_tag_and_platform_are_used(self):
        result = self.invoke('--image', 'example/istudio', '--tag', 'v1.2.3', '--platform', 'linux/amd64', '--no-cache')
        self.assertEqual(result.returncode, 0, result.stderr)
        build = self.build()
        self.assertEqual(build[build.index('--tag') + 1], 'example/istudio:v1.2.3')
        self.assertEqual(build[build.index('--platform') + 1], 'linux/amd64')
        self.assertIn('--no-cache', build)

    def test_local_build_loads_the_image_without_publishing_or_creating_a_builder(self):
        result = self.invoke('--local')
        self.assertEqual(result.returncode, 0, result.stderr)
        build = self.build()
        self.assertEqual(build[build.index('--tag') + 1], 'istudio:local')
        self.assertIn('--load', build)
        self.assertNotIn('--push', build)
        self.assertNotIn('--platform', build)
        self.assertFalse(any(call[:2] in (['buildx', 'create'], ['buildx', 'inspect']) for call in self.calls))

    def test_help_and_dry_run_never_call_docker(self):
        for arguments in (('--help',), ('--dry-run',), ('--local', '--dry-run')):
            with self.subTest(arguments=arguments):
                result = self.invoke(*arguments, ISTUDIO_TEST_FAIL='daemon')
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.calls, [])
                self.assertNotIn('镜像已推送', result.stdout)

    def test_invalid_arguments_fail_before_docker_is_contacted(self):
        for arguments in (
            ('--unknown',), ('--tag',), ('--image', '--dry-run'),
            ('--tag', 'a' * 129), ('--tag', 'bad tag'),
            ('--image', 'example/repo:latest'), ('--image', 'repository'),
            ('--platform', 'windows/amd64'),
            ('--local', '--platform', 'linux/amd64,linux/arm64'),
        ):
            with self.subTest(arguments=arguments):
                result = self.invoke(*arguments)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.calls, [])

    def test_an_unavailable_daemon_stops_before_building(self):
        result = self.invoke(ISTUDIO_TEST_FAIL='daemon')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls, [['info']])
        self.assertIn('无法连接 Docker', result.stderr)

    def test_builder_bootstrap_failure_prevents_a_build(self):
        result = self.invoke(ISTUDIO_TEST_FAIL='bootstrap')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(call[:2] == ['buildx', 'build'] for call in self.calls))
        self.assertNotIn('镜像已推送', result.stdout)

    def test_failed_build_does_not_report_a_successful_publish(self):
        result = self.invoke(ISTUDIO_TEST_FAIL='build')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('镜像已推送', result.stdout)
        self.assertNotIn('服务器 .env', result.stdout)


if __name__ == '__main__':
    unittest.main()
