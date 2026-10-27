# EvoLink 提示词增量批次

来源为 [Evolink-AI/awesome-gpt-image-2-API-Prompts](https://github.com/Evolink-AI/awesome-gpt-image-2-API-Prompts)，使用已固定的提交 `e2a269ad1a055a0b4f6c1e170341c6c1aba30faa`。仓库声明使用 CC0-1.0，原许可证保存在同目录 `LICENSE`。本目录保存人工筛选的新增类型，而非执行或安装上游脚本。

批次 JSON 保存中文标题、分类、可直接使用的正文、原始正文、作者及来源、入选理由、固定版本示例图路径和校验值。上游 `{argument name="…" default="…"}` 参数标记替换为默认值，其他正文和参考图前提保留。封面是源仓库示例图，不代表本站模型已经重新生成并验证效果。

2026-10-25 批次共 148 条：`2026-10-25.json` 中 140 条使用上游示例图；`2026-10-25-generated.json` 中 8 条原图文错配，已由项目工作台使用 gpt-image-2 各生成一张，并保存任务、演示变量与参考图来源。按用户后续要求，8 张公共封面已直接使用原始 PNG，字节与生成账户资产一致。全部内容沿用现有分类。

公共图片在 `server/storage/uploads/inspiration/` 原目录纳入 Git，克隆仓库即可取得已提交的封面。缺少上游图片时可用下面的命令重新下载；下载仅访问固定提交下的 GitHub 图片，核对字节数、SHA-256 和 Git blob，已有文件校验一致时跳过，校验不一致时停止，不覆盖。

在仓库根目录执行，先备份现有公共库：

```sh
mkdir -p test/backups/evolink-import
docker compose -f docker/docker-compose.yml exec -T postgres \
  pg_dump -U istudio -d istudio --data-only --column-inserts \
  --table=inspiration_categories --table=inspiration_prompts \
  > test/backups/evolink-import/library-before.sql
```

准备图片并生成预演 SQL，默认以 `ROLLBACK` 结束：

```sh
python3 server/seed/evolink/import.py \
  --manifest server/seed/evolink/2026-10-25.json \
  --image-dir server/storage/uploads/inspiration \
  --download --output-sql /tmp/istudio-evolink-preview.sql
docker compose -f docker/docker-compose.yml exec -T postgres \
  psql -U istudio -d istudio -f - < /tmp/istudio-evolink-preview.sql
```

确认预演数量后，用相同输入生成提交 SQL：

```sh
python3 server/seed/evolink/import.py \
  --manifest server/seed/evolink/2026-10-25.json \
  --image-dir server/storage/uploads/inspiration \
  --commit --output-sql /tmp/istudio-evolink-apply.sql
docker compose -f docker/docker-compose.yml exec -T postgres \
  psql -U istudio -d istudio -f - < /tmp/istudio-evolink-apply.sql
```

导入使用与后台分类编辑相同的事务锁，并检查旧记录完整保留。条目使用独立的 `evolink-` 编号，只插入缺失 ID，不覆盖已有正文、封面、分类、排序或启用状态；缺少的分类自动建立。重复提交同一批次新增数量为 0。正文以 Base64 数据经 COPY 读取，不拼接进 SQL 语句。

此脚本适用于当前本地存储，发现启用云存储时事务会停止；云环境需要先通过项目存储路由保存公开灵感封面，不能把用户私有生成资产的地址直接发布。它不迁移数据库结构，不重建容器，也不会调用生图、提示词优化或图片反推服务。

补图批次的公共 PNG 已随原图片目录纳入 Git；若本地缺失，可从 Git 恢复或使用存储备份。将上述命令的 `--manifest` 改为 `server/seed/evolink/2026-10-25-generated.json` 即可重放。缺少已生成封面时脚本会停止，不会下载上游错图或自动发起收费生成。额外 PNG 备份位于本机忽略目录 `test/backups/inspiration-evolink-2026-10-25/generated-covers-png.tar.gz`，私有生成资产及完整运行存储仍随既有备份方式维护。初次导入的 WebP 仅作历史备份，已无数据库引用。

审阅记录见 `review-decisions-2026-10-25.json`，实际导入与验收见 [专项报告](../../../test/reports/evolink-prompts-import-2026-10-25.md)。原始来源提示词中混有视频段、重复版本或末尾残句的精选项，仅截取完整生图段，调整理由保存在批次 `promptAdjustment` 中。
