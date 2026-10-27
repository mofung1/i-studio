import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("inspiration_bundle", Path(__file__).with_name("inspiration-bundle.py"))
bundle_tool = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bundle_tool)


def sample_snapshot():
    return {
        "categories": [{"id": "category-1", "name": "插画", "created_at": "2026-10-26T00:00:00+00:00"}],
        "prompts": [{
            "id": "prompt-1", "title": "保留原文", "category": "插画",
            "prompt": "中文、'单引号'、反斜线 \\\n\\.\nDROP TABLE users;", "source": "公开来源",
            "image_key": "original.png", "image_width": 100, "image_height": 200,
            "enabled": False, "sort_order": 17, "created_at": "2026-10-26T00:00:00+00:00",
            "instructions": "先上传参考图", "requires_reference": True,
            "submission_id": "must-not-export", "private_field": "must-not-export",
        }],
    }


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.storage = self.root / "source"
        (self.storage / "inspiration").mkdir(parents=True)
        (self.storage / "inspiration/original.png").write_bytes(b"public-cover")
        (self.storage / "inspiration/unreferenced.png").write_bytes(b"unused")
        (self.storage / ".ai").mkdir()
        (self.storage / ".ai/encryption.key").write_bytes(b"secret")
        self.output = self.root / "bundle"

    def test_export_keeps_library_fields_and_only_referenced_covers(self):
        manifest = bundle_tool.export_bundle(sample_snapshot(), self.storage, self.output)
        row = manifest["prompts"][0]
        self.assertEqual(set(row), set(bundle_tool.PROMPT_FIELDS))
        self.assertEqual(row["prompt"], sample_snapshot()["prompts"][0]["prompt"])
        self.assertFalse(row["enabled"])
        self.assertTrue(row["requires_reference"])
        self.assertEqual(row["sort_order"], 17)
        self.assertEqual(len(manifest["files"]), 1)
        self.assertFalse((self.output / "storage/.ai").exists())
        self.assertEqual(bundle_tool.verify_bundle(self.output), manifest)
        destination = self.root / "destination"
        bundle_tool.install_covers(self.output, manifest, destination)
        bundle_tool.install_covers(self.output, manifest, destination)
        self.assertEqual((destination / row["image_key"]).read_bytes(), b"public-cover")

    def test_community_covers_are_detached_and_deduplicated(self):
        snapshot = sample_snapshot()
        (self.storage / "inspiration/community").mkdir()
        (self.storage / "inspiration/community/published.png").write_bytes(b"public-cover")
        second = dict(snapshot["prompts"][0], id="published", image_key="inspiration/community/published.png")
        snapshot["prompts"].append(second)
        manifest = bundle_tool.export_bundle(snapshot, self.storage, self.output)
        self.assertEqual(len(manifest["files"]), 1)
        self.assertEqual(manifest["prompts"][0]["image_key"], manifest["prompts"][1]["image_key"])
        self.assertNotIn("submission_id", manifest["prompts"][1])
        self.assertNotIn("community/", manifest["prompts"][1]["image_key"])

    def test_missing_cover_does_not_publish_partial_bundle(self):
        (self.storage / "inspiration/original.png").unlink()
        with self.assertRaises(FileNotFoundError):
            bundle_tool.export_bundle(sample_snapshot(), self.storage, self.output)
        self.assertFalse(self.output.exists())

    def test_unsafe_cloud_and_symlink_paths_are_rejected(self):
        for key in ("../.ai/encryption.key", "inspiration/../../private.png", "@storage/old/inspiration/image.png", "/tmp/image.png"):
            with self.subTest(key=key), self.assertRaises(ValueError):
                bundle_tool.cover_path(self.storage, key)
        (self.root / "private.png").write_bytes(b"private")
        (self.storage / "inspiration/symlink.png").symlink_to(self.root / "private.png")
        with self.assertRaises(ValueError):
            bundle_tool.cover_path(self.storage, "symlink.png")

    def test_corruption_and_existing_different_files_are_rejected(self):
        manifest = bundle_tool.export_bundle(sample_snapshot(), self.storage, self.output)
        target = self.root / "destination"
        path = target / manifest["files"][0]["key"]
        path.parent.mkdir(parents=True)
        path.write_bytes(b"existing")
        with self.assertRaises(ValueError):
            bundle_tool.install_covers(self.output, manifest, target)
        self.assertEqual(path.read_bytes(), b"existing")
        (self.output / "storage" / manifest["files"][0]["key"]).write_bytes(b"corrupt")
        with self.assertRaises(ValueError):
            bundle_tool.verify_bundle(self.output)


@unittest.skipUnless(os.environ.get("INSPIRATION_TEST_CONTAINER"), "isolated PostgreSQL container not configured")
class PostgreSQLImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.container = os.environ["INSPIRATION_TEST_CONTAINER"]
        cls.schema = "bundle_test_" + secrets.token_hex(8)
        cls.raw_sql("CREATE SCHEMA " + cls.schema)

    @classmethod
    def tearDownClass(cls):
        cls.raw_sql("DROP SCHEMA " + cls.schema + " CASCADE")

    @classmethod
    def raw_sql(cls, sql, scoped=False, check=True):
        command = ["docker", "exec", "-i"]
        if scoped:
            command += ["-e", "PGOPTIONS=-c search_path=" + cls.schema]
        command += [cls.container, "psql", "-XqAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
        return subprocess.run(command, input=sql, text=True, capture_output=True, check=check)

    def test_preview_commit_retry_conflict_and_private_data(self):
        self.raw_sql("""
CREATE TABLE inspiration_categories(id text PRIMARY KEY,name text UNIQUE,created_at timestamptz);
CREATE TABLE inspiration_prompts(id text PRIMARY KEY,title text,category text,prompt text,source text,
 image_key text,image_width int,image_height int,enabled boolean,sort_order int,created_at timestamptz,
 submission_id text,instructions text,requires_reference boolean);
CREATE TABLE storage_settings(id boolean PRIMARY KEY,active_profile text);
CREATE TABLE users(id text PRIMARY KEY);
INSERT INTO users VALUES('unrelated-user');
""", scoped=True)
        snapshot = sample_snapshot()
        snapshot["prompts"][0] = {key: snapshot["prompts"][0][key] for key in bundle_tool.PROMPT_FIELDS}
        preview = self.raw_sql(bundle_tool.import_sql(snapshot), scoped=True)
        self.assertEqual(json.loads(preview.stdout)["bundlePrompts"], 1)
        self.assertEqual(self.raw_sql("SELECT count(*) FROM inspiration_prompts", scoped=True).stdout.strip(), "0")
        for _ in range(2):
            result = self.raw_sql(bundle_tool.import_sql(snapshot, apply=True), scoped=True)
            self.assertEqual(json.loads(result.stdout)["totalPrompts"], 1)
        preserved = json.loads(self.raw_sql("SELECT to_jsonb(p) FROM inspiration_prompts p", scoped=True).stdout)
        self.assertEqual(preserved["prompt"], snapshot["prompts"][0]["prompt"])
        self.assertIsNone(preserved["submission_id"])
        self.assertEqual(self.raw_sql("SELECT count(*) FROM users", scoped=True).stdout.strip(), "1")
        snapshot["prompts"][0]["prompt"] = "conflicting content"
        conflict = self.raw_sql(bundle_tool.import_sql(snapshot, apply=True), scoped=True, check=False)
        self.assertNotEqual(conflict.returncode, 0)
        self.assertEqual(self.raw_sql("SELECT count(*) FROM inspiration_prompts", scoped=True).stdout.strip(), "1")
        if os.environ.get("INSPIRATION_TEST_BUNDLE"):
            manifest = bundle_tool.verify_bundle(Path(os.environ["INSPIRATION_TEST_BUNDLE"]))
            self.raw_sql("TRUNCATE inspiration_prompts,inspiration_categories", scoped=True)
            for _ in range(2):
                result = self.raw_sql(bundle_tool.import_sql(manifest, apply=True), scoped=True)
                self.assertEqual(json.loads(result.stdout)["totalPrompts"], len(manifest["prompts"]))
                self.assertEqual(json.loads(result.stdout)["totalCategories"], len(manifest["categories"]))
            rows = json.loads(self.raw_sql("SELECT jsonb_agg(to_jsonb(p)-'submission_id') FROM inspiration_prompts p", scoped=True).stdout)
            self.assertEqual({row["id"]: row for row in rows}, {row["id"]: row for row in manifest["prompts"]})
            self.assertEqual(self.raw_sql("SELECT count(*) FROM users", scoped=True).stdout.strip(), "1")


if __name__ == "__main__":
    unittest.main()
