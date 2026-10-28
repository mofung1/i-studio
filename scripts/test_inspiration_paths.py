import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest


def module(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


normalize = module('normalize-inspiration-paths')
prepare = module('prepare-image-catalog')


class PathTests(unittest.TestCase):
    def test_legacy_and_canonical_paths_resolve_to_the_same_object(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            images = root / 'inspiration'
            images.mkdir()
            data = b'public-cover'
            checksum = hashlib.sha256(data).hexdigest()
            canonical = 'inspiration/library/' + checksum + '.jpg'
            (images / 'case1.jpg').write_bytes(data)
            changes, files = normalize.plan([{'id': 'one', 'image_key': 'case1.jpg'}], root)
            self.assertEqual(changes[0]['new'], canonical)
            legacy = dict.fromkeys(prepare.PROMPT_FIELDS, '')
            legacy.update(id='one', image_key='case1.jpg')
            prepared = prepare.prepare({'categories': [{'id': 'c', 'name': 'Art'}], 'prompts': [legacy]}, images)
            self.assertEqual((root / canonical).read_bytes(), data)
            self.assertEqual(prepared['files'][0]['key'], canonical)
            self.assertEqual(normalize.plan([{'id': 'one', 'image_key': canonical}], root)[0], [])
            prompt = dict.fromkeys(prepare.PROMPT_FIELDS, '')
            prompt.update(id='one', image_key=canonical)
            second = dict(prompt, id='two', image_key='case1.jpg')
            snapshot = {'categories': [{'id': 'c', 'name': 'Art'}], 'prompts': [prompt, second]}
            catalog = prepare.prepare(snapshot, images)
            self.assertEqual(len(catalog['files']), 1)
            self.assertTrue(all(p['image_key'] == canonical for p in catalog['prompts']))
            self.assertEqual(catalog['files'][0]['sha256'], checksum)
            self.assertEqual(snapshot['prompts'][1]['image_key'], 'case1.jpg')

    def test_missing_and_outside_files_abort_before_migration(self):
        with tempfile.TemporaryDirectory() as directory:
            for key in ['missing.jpg', '../private.jpg', 'inspiration/../private.jpg']:
                with self.assertRaises(ValueError):
                    normalize.plan([{'id': 'one', 'image_key': key}], Path(directory))


if __name__ == '__main__':
    unittest.main()
