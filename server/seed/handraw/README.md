# handraw-style 风格增量批次

来源：[yang0/handraw-style](https://github.com/yang0/handraw-style)，固定提交 `f7c39649fe70a667069fdbe5eb60df0a1bca4f24`。作者为 **yang0**；按上游附署名要求的 MIT 许可证使用，完整许可保存在同目录 `LICENSE`，每条公开来源也保留作者和仓库链接。

2026-10-27 对照当前本地公共灵感库的 697 条正文，审阅上游 `styles.json` 的全部 **366 条**：新增 **101 条**，213 条由旧库或本批代表风格覆盖，52 条只有作者、作品名称或空特征，暂不导入。README 的 365 与数据数量不同，以固定版本实际数据为准。本批只处理风格提示词；排版、主题色、教程和摄影编排流程不在本次范围内。

新增内容归入现有分类：插画艺术 84 条、摄影写实 16 条、人物角色 1 条。当前本地公共库为 **798 条、13 类**。在「发现灵感」搜索 **yang0** 可查看本批全部条目，也可搜索 `FA-039`、`FC-031` 等风格编号。

## 内容与配图

- `2026-10-27.json` 保存中文标题、英文生图名称、原始视觉特征、参考来源、分类、入选理由、上游编号/旧编号、固定版本图片路径与校验值。
- `review-decisions-2026-10-27.json` 覆盖全部 366 条，逐条记录新增、已有覆盖或特征不完整。覆盖项指向实际旧记录或本批代表条目，避免按作者、地区、性别、主题和色调重复导入。
- 正文为可复用的**风格段**：中文画风标题、英文生图名称和上游中文核心特征；使用时再补充自己的主体、场景和画面文字。没有把教程指令、安装行为或外部脚本导入为提示词。
- 100 张公开封面来自上游，逐张核对 Git blob、SHA-256、WebP 解码和尺寸，并通过总览人工检查。图上可能保留上游作者或旧标题文字；编号和正文以批次数据为准。这些是风格样例，不是本站模型实测结果。
- `FC-030` 的独立图与旧编号 287 总览图均为古风人物，和几何气刷颗粒特征不符。该条保留完整风格段，公开封面留空，使用已有占位样式；错图元数据保存在 `rejectedCover`，不会下载或发布为封面。本次没有调用收费生图或其他 AI 服务。

## 重放导入

需要 Python 3、Pillow，以及完成迁移的 PostgreSQL。本目录脚本只生成 SQL；执行 SQL 才会修改公共灵感库。当前环境已完成导入，无需重新部署。

在项目根目录先备份：

```sh
mkdir -p test/backups/handraw-import
docker compose -f docker/docker-compose.yml exec -T postgres \
  pg_dump -U istudio -d istudio --data-only --column-inserts \
  --table=inspiration_categories --table=inspiration_prompts \
  > test/backups/handraw-import/library-before.sql
```

准备图片并预演，事务以 `ROLLBACK` 结束：

```sh
python3 server/seed/handraw/import.py \
  --manifest server/seed/handraw/2026-10-27.json \
  --image-dir server/storage/uploads/inspiration \
  --download --output-sql /tmp/istudio-handraw-preview.sql
docker compose -f docker/docker-compose.yml exec -T postgres \
  psql -U istudio -d istudio -f - < /tmp/istudio-handraw-preview.sql
```

提交相同批次：

```sh
python3 server/seed/handraw/import.py \
  --manifest server/seed/handraw/2026-10-27.json \
  --image-dir server/storage/uploads/inspiration \
  --commit --output-sql /tmp/istudio-handraw-apply.sql
docker compose -f docker/docker-compose.yml exec -T postgres \
  psql -U istudio -d istudio -f - < /tmp/istudio-handraw-apply.sql
```

导入使用与后台分类操作相同的事务锁，仅插入缺失的 `handraw-` ID，逐字段检查所有旧提示词和分类保持原样。重复提交新增为 0，不覆盖已编辑正文、封面或启用状态。提示词通过 Base64 COPY 作为数据传递。已有文件哈希不符时停止，不覆盖文件。

公共图片在 `server/storage/uploads/inspiration/` 原目录纳入 Git，克隆仓库即可取得已提交的封面，也可按固定版本重新下载。脚本发现启用云存储时停止；云环境需先通过项目存储路由保存公开封面。本次实际备份位于忽略目录 `test/backups/handraw-import-2026-10-27/`。

实际数据与接口验收见 [导入报告](../../../test/reports/handraw-styles-import-2026-10-27.md)。
