# 本地开发与测试

部署已发布镜像请看 [安装说明](docker-image.md)。本文面向修改代码的开发者，命令默认在仓库根目录执行。

## 工具与目录

| 工具 | 仓库要求 |
| --- | --- |
| Go | 以 `server/go.mod` 为准，当前 toolchain 为 1.27.3 |
| Node.js | 22.12.0 或更新版本 |
| pnpm | 10.12.1，与 `web/package.json` 一致 |
| Docker / Compose | 运行本地 PostgreSQL、Redis 或镜像验收 |
| Python | Python 3，用于公共库和运维工具的测试 |

开发脚本使用 Bash、`lsof`、`curl`，适合 macOS / Linux；Windows 可在 WSL 中运行。

- `web/`：Next.js 前端、组件、页面与前端测试。
- `server/cmd/server/`：Go 入口；`server/internal/`：服务、业务、存储和数据库迁移。
- `server/seed/`：随软件分发的公共灵感清单及来源记录。
- `docker/`：开发和其他部署配置；根目录 `compose.yml` 用于应用镜像部署。
- `scripts/`：公共库导出、镜像验收及开发数据维护工具。
- `docs/`：安装、使用、运维及架构文档。

## 启动开发服务

首次创建配置，已有文件请保留：

```sh
test -f server/.env || cp server/.env.example server/.env
cd web
pnpm install --frozen-lockfile
cd ..
./dev.sh --infra
```

脚本启动本地 PostgreSQL / Redis、编译 Go API 并启动 Next.js 开发服务。默认前端为 <http://127.0.0.1:3000>，API 为 <http://127.0.0.1:4000/v1/health>；数据库、Redis 端口分别为 55432、56379。示例中的数据库密码仅用于本地开发，不用于公网部署。

API 读取 `server/.env`；AI 渠道、密钥和模型在管理员后台配置。需要后台账号时自行填写 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 并重启开发进程，详见 [管理员说明](administrator.md)。数据库是必选依赖；Redis 不可用时任务仍保存于 PostgreSQL，但开发时建议一起启动。

更换端口可运行 `./dev.sh --web-port 3100 --api-port 4100`。Ctrl+C 停止脚本启动的 API 与前端，保留数据库容器与数据。若已运行开发 Compose 的 `api` 服务，先停掉它，避免两个 API 共用队列。根目录安装配置、开发 Compose 及生产配置使用不同端口，勿混用命令。

源码开发进程不会自动导入内置灵感库。在全新的开发数据库中需要示例内容时，另开终端执行：

```sh
cd server
go run ./cmd/server bootstrap-inspiration \
  --catalog seed/inspiration-catalog.json \
  --images storage/uploads/inspiration
```

命令只对尚未初始化的空公共库安装一次；已有库及管理员编辑会保留。完整应用镜像的入口脚本会执行这一步，通常无需手工调用。

## 验证修改

前端：

```sh
cd web
pnpm test
pnpm typecheck
pnpm build
```

提交前用现有 Prettier 检查修改过的前端文件，例如 `pnpm exec prettier --check components/input.tsx`，将示例路径换成实际修改文件。

后端：

```sh
make -C server check
```

该命令执行格式检查、`go vet` 和带 race 检测的 Go 测试，需要可用的 C 编译器。**未设置 `TEST_DATABASE_URL` 时，数据库集成测试会跳过**，不能把这样的通过视为完整验证。

完整数据库测试使用专用测试库。先启动本地基础服务，只在第一次创建该库：

```sh
docker compose -f docker/docker-compose.yml up -d --wait postgres redis
docker compose -f docker/docker-compose.yml exec -T postgres \
  psql -U istudio -d postgres -v ON_ERROR_STOP=1 \
  -c 'CREATE DATABASE istudio_test;'
```

然后运行：

```sh
TEST_DATABASE_URL='postgresql://istudio:istudio_dev@127.0.0.1:55432/istudio_test?sslmode=disable' \
  make -C server check
```

连接信息对应默认开发 Compose；如果改过用户名、密码或端口，请同步调整。测试用户需有创建 schema 的权限。数据库测试在随机 schema 中建表并在结束后清理，仍应使用专用测试库，避免指向部署站点。

Python 工具的常规检查：

```sh
python3 -m unittest discover -s scripts -p 'test_*.py'
```

其中公共库导入的 PostgreSQL 测试需额外设置 `INSPIRATION_TEST_CONTAINER`，未设置时跳过；默认只执行本地文件校验和模拟的维护防护测试，不会清理业务数据。

修改镜像或部署流程时，构建后执行临时 Compose 项目的安装验收：

```sh
docker buildx build -f docker/image.Dockerfile -t istudio:local --load .
python3 scripts/test-docker-image.py --image istudio:local
```

验收脚本创建临时容器和卷，检查页面、管理员、公共库、图片及重启后的持久化，并清理自己的临时环境。常规测试使用测试替身，不需要供应商 API Key。带有 `live` 的付费验收测试需要显式授权变量，不应默认加入 CI。

## 配置与数据边界

`.env`、数据库与 Redis 数据、私钥、用户上传和测试产物保存在本地。允许提交的 `.env*.example` 只放占位符或明确标注的本地开发值。公共灵感封面约 253 MiB，是新站初始化资源；不要直接删除或整体忽略它们。运行站点的 `inspiration/community/` 投稿不进入 Git 和应用镜像。

导出公共库或使用清理工具前，先读对应脚本的 `--help` 并确认数据源；不要用开发数据重置脚本维护线上站点。贡献要求见 [CONTRIBUTING](../CONTRIBUTING.md)。
