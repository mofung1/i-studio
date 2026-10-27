#!/usr/bin/env python3
"""Move the inspiration library and its covers without copying users or credentials."""
import argparse
import base64
import datetime
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tempfile

PROJECT = Path(__file__).resolve().parents[1]
PROMPT_FIELDS = (
    "id", "title", "category", "prompt", "source", "image_key", "image_width",
    "image_height", "enabled", "sort_order", "created_at", "instructions", "requires_reference",
)
CATEGORY_FIELDS = ("id", "name", "created_at")
SNAPSHOT_SQL = """BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT jsonb_build_object(
 'categories', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM
   (SELECT id,name,created_at FROM inspiration_categories ORDER BY id) c),'[]'::jsonb),
 'prompts', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM
   (SELECT id,title,category,prompt,source,image_key,image_width,image_height,enabled,
           sort_order,created_at,instructions,requires_reference
    FROM inspiration_prompts ORDER BY sort_order,id) p),'[]'::jsonb));
COMMIT;
"""


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def inside(path, root):
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def cover_path(root, key):
    if not isinstance(key, str) or key.startswith("@storage/"):
        raise ValueError("灵感封面使用云存储；此工具仅处理本地封面，请先准备本地公开封面。")
    part = PurePosixPath(key)
    if (not key or part.is_absolute() or str(part) != key or ".." in part.parts
            or "\\" in key or "\x00" in key or part.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp")):
        raise ValueError("灵感封面路径无效。")
    if part.parts[0] != "inspiration":
        part = PurePosixPath("inspiration") / part
    root = root.resolve()
    candidate = (root / str(part)).resolve()
    if not inside(candidate, root / "inspiration"):
        raise ValueError("灵感封面路径超出公开目录。")
    return candidate


def psql(args, sql):
    command = ["docker", "compose", "-f", str(args.compose_file)]
    if args.env_file:
        command += ["--env-file", str(args.env_file)]
    command += ["exec", "-T", "postgres", "psql", "-XqAt", "-U", "istudio", "-d", "istudio",
                "-v", "ON_ERROR_STOP=1"]
    result = subprocess.run(command, input=sql, universal_newlines=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise ValueError("PostgreSQL 操作失败，请检查 Compose 服务、数据库迁移及灵感库记录冲突；没有提交部分数据。")
    return json.loads(result.stdout)


def export_bundle(snapshot, storage_root, output):
    if output.exists():
        raise ValueError("输出目录已存在，请使用新的目录。")
    if inside(output.resolve(), storage_root.resolve()):
        raise ValueError("导出目录不能位于运行存储目录内。")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".inspiration-export-", dir=output.parent) as temporary:
        bundle = Path(temporary) / "bundle"
        (bundle / "storage" / "inspiration" / "library").mkdir(parents=True)
        manifest = {
            "version": 1,
            "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "categories": [{key: row[key] for key in CATEGORY_FIELDS} for row in snapshot["categories"]],
            "prompts": [], "files": [],
        }
        files = {}
        for original in snapshot["prompts"]:
            row = {key: original[key] for key in PROMPT_FIELDS}
            if row["image_key"]:
                source = cover_path(storage_root, row["image_key"])
                checksum = digest(source)
                # Published community covers become independent library covers, without account FKs.
                key = "inspiration/library/" + checksum + source.suffix.lower()
                if key not in files:
                    destination = bundle / "storage" / key
                    shutil.copyfile(source, destination)
                    if digest(destination) != checksum:
                        raise ValueError("复制期间封面发生变化，请重新导出。")
                    files[key] = {"key": key, "sha256": checksum, "size": destination.stat().st_size}
                row["image_key"] = key
            manifest["prompts"].append(row)
        manifest["files"] = sorted(files.values(), key=lambda row: row["key"])
        (bundle / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        verify_bundle(bundle)
        bundle.rename(output)
    return manifest


def verify_bundle(bundle):
    manifest = json.loads((bundle / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("version") != 1:
        raise ValueError("不支持的灵感包版本。")
    for name, fields in (("categories", CATEGORY_FIELDS), ("prompts", PROMPT_FIELDS)):
        rows = manifest[name]
        if not isinstance(rows, list) or any(set(row) != set(fields) for row in rows):
            raise ValueError("灵感包字段不匹配。")
        if len({row["id"] for row in rows}) != len(rows):
            raise ValueError("灵感包存在重复编号。")
    files = {}
    for item in manifest["files"]:
        key, checksum = item["key"], item["sha256"]
        expected = "inspiration/library/" + checksum
        if (len(checksum) != 64 or any(char not in "0123456789abcdef" for char in checksum)
                or key not in [expected + suffix for suffix in (".jpg", ".jpeg", ".png", ".webp")]
                or key in files):
            raise ValueError("灵感包封面清单无效。")
        path = cover_path(bundle / "storage", key)
        if not path.is_file() or path.stat().st_size != item["size"] or digest(path) != checksum:
            raise ValueError("灵感包封面缺失或哈希不一致：" + key)
        files[key] = item
    referenced = {row["image_key"] for row in manifest["prompts"] if row["image_key"]}
    if referenced != set(files):
        raise ValueError("灵感提示词与封面清单不一致。")
    return manifest


def import_sql(manifest, apply=False):
    payload = base64.b64encode(json.dumps(manifest, ensure_ascii=False).encode()).decode()
    return r"""BEGIN;
SET LOCAL lock_timeout='10s';
SELECT pg_advisory_xact_lock(724091025) \g /dev/null
LOCK TABLE inspiration_categories,inspiration_prompts IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE bundle_payload(encoded text) ON COMMIT DROP;
COPY bundle_payload FROM STDIN;
""" + payload + r"""
\.
CREATE TEMP TABLE bundle_document ON COMMIT DROP AS
 SELECT convert_from(decode(encoded,'base64'),'UTF8')::jsonb AS value FROM bundle_payload;
CREATE TEMP TABLE bundle_categories ON COMMIT DROP AS
 SELECT c.* FROM bundle_document,
 jsonb_to_recordset(value->'categories') AS c(id text,name text,created_at timestamptz);
CREATE TEMP TABLE bundle_prompts ON COMMIT DROP AS
 SELECT p.* FROM bundle_document,
 jsonb_to_recordset(value->'prompts') AS p(
 id text,title text,category text,prompt text,source text,image_key text,
 image_width integer,image_height integer,enabled boolean,sort_order integer,
 created_at timestamptz,instructions text,requires_reference boolean);
DO $$ BEGIN
 IF COALESCE((SELECT active_profile FROM storage_settings WHERE id=true),'local') <> 'local' THEN
  RAISE EXCEPTION 'Import requires local storage';
 END IF;
 IF EXISTS(SELECT 1 FROM inspiration_categories c JOIN bundle_categories b
           ON c.id=b.id OR c.name=b.name WHERE to_jsonb(c)<>to_jsonb(b)) THEN
  RAISE EXCEPTION 'Category conflicts with existing data';
 END IF;
 IF EXISTS(SELECT 1 FROM inspiration_prompts p JOIN bundle_prompts b ON p.id=b.id
           WHERE p.submission_id IS NOT NULL OR (to_jsonb(p)-'submission_id')<>to_jsonb(b)) THEN
  RAISE EXCEPTION 'Prompt conflicts with existing data';
 END IF;
END $$;
INSERT INTO inspiration_categories(id,name,created_at)
 SELECT id,name,created_at FROM bundle_categories WHERE true ON CONFLICT(id) DO NOTHING;
INSERT INTO inspiration_prompts(
 id,title,category,prompt,source,image_key,image_width,image_height,enabled,sort_order,
 created_at,instructions,requires_reference)
 SELECT id,title,category,prompt,source,image_key,image_width,image_height,enabled,sort_order,
        created_at,instructions,requires_reference
 FROM bundle_prompts WHERE true ON CONFLICT(id) DO NOTHING;
SELECT jsonb_build_object('bundlePrompts',(SELECT count(*) FROM bundle_prompts),
 'totalPrompts',(SELECT count(*) FROM inspiration_prompts),
 'totalCategories',(SELECT count(*) FROM inspiration_categories));
""" + ("COMMIT;\n" if apply else "ROLLBACK;\n")


def install_covers(bundle, manifest, storage_root):
    # Verify all conflicts before copying anything; never replace different existing bytes.
    for item in manifest["files"]:
        destination = cover_path(storage_root, item["key"])
        if destination.exists() and digest(destination) != item["sha256"]:
            raise ValueError("目标存储已有不同内容的同名封面。")
    for item in manifest["files"]:
        destination = cover_path(storage_root, item["key"])
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            try:
                with destination.open("xb") as target, (bundle / "storage" / item["key"]).open("rb") as source:
                    shutil.copyfileobj(source, target)
            except FileExistsError:
                pass
        if digest(destination) != item["sha256"]:
            raise ValueError("目标封面写入校验失败。数据库尚未导入，可修复文件后重试。")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command")
    export = commands.add_parser("export", help="只读导出灵感库及引用的本地封面")
    export.add_argument("--output", type=Path, required=True)
    export.add_argument("--storage-root", type=Path, default=PROJECT / "server/storage/uploads")
    export.add_argument("--compose-file", type=Path, default=PROJECT / "docker/docker-compose.yml")
    export.add_argument("--env-file", type=Path)
    verify = commands.add_parser("verify", help="离线核对提示词、封面及 SHA-256")
    verify.add_argument("--bundle", type=Path, required=True)
    restore = commands.add_parser("import", help="预检导入；--apply 才复制封面并提交数据库")
    restore.add_argument("--bundle", type=Path, required=True)
    restore.add_argument("--storage-root", type=Path, required=True)
    restore.add_argument("--compose-file", type=Path, required=True)
    restore.add_argument("--env-file", type=Path)
    restore.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.command is None:
        parser.error("请选择 export、verify 或 import")
    try:
        if args.command == "export":
            manifest = export_bundle(psql(args, SNAPSHOT_SQL), args.storage_root, args.output)
        else:
            manifest = verify_bundle(args.bundle)
            if args.command == "import":
                # Check database conflicts in a rolled-back transaction before copying files.
                psql(args, import_sql(manifest))
                if args.apply:
                    install_covers(args.bundle, manifest, args.storage_root)
                    psql(args, import_sql(manifest, apply=True))
        print(json.dumps({"command": args.command, "prompts": len(manifest["prompts"]),
                          "categories": len(manifest["categories"]), "covers": len(manifest["files"]),
                          "applied": bool(getattr(args, "apply", False))}, ensure_ascii=False))
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
