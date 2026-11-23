# 本地开发与测试

部署已发布镜像请看 [安装说明](docker-image.md)。本文面向修改代码的开发者，命令默认在仓库根目录执行。

## 开发工具

| 工具 | 仓库要求 |
| --- | --- |
| Go | 以 `server/go.mod` 为准，当前 toolchain 为 1.27.3 |
| Node.js | 22.12.0 或更新版本 |
| pnpm | 10.12.1，与 `web/package.json` 一致 |
| Docker / Compose | 运行本地 PostgreSQL、Redis 或镜像验收 |
| Python | Python 3，用于公共库和运维工具的测试 |

开发脚本使用 Bash、`lsof`、`curl`，适合 macOS / Linux；Windows 可在 WSL 中运行。

## 按业务查找代码

| 要改的功能 | 页面或前端代码 | 服务端代码 |
| --- | --- | --- |
| 官网与工具介绍 | [官网路由](../web/app/%28marketing%29)、[展示组件](../web/components/marketing) | [品牌与站点设置](../server/internal/studio/site_settings.go) |
| 生图与电商工作台 | `/studio` 与 `/workbench` 共用[工作台](../web/components/workbench.tsx)，[任务提交与恢复](../web/components/workbench/use-generation-task.ts)管理报价、提交和轮询 | [任务接口](../server/internal/studio/generation_handlers.go)、[积分预留与结算](../server/internal/studio/credits.go)、[逐张交付](../server/internal/studio/generation_delivery.go) |
| 商品档案与采用版本 | [商品工作室](../web/components/products)、[商品 API 与类型](../web/lib/products.ts) | [档案](../server/internal/studio/commerce_products.go)、[商品生成参数](../server/internal/studio/commerce_products_generation.go)、[版本与采用](../server/internal/studio/commerce_products_versions.go) |
| 素材库、项目与任务记录 | [素材库页面](../web/app/assets/asset-library.tsx)承载素材和任务两种视图 | [素材查询](../server/internal/studio/asset_library.go)、[项目](../server/internal/studio/project_handlers.go)、[任务历史](../server/internal/studio/generation_history.go)、[图片存储](../server/internal/storage) |
| 提示词、反推与公共灵感 | [个人提示词](../web/components/personal-prompt-library.tsx)、[图片反推](../web/components/prompt-reverse-dialog.tsx)、[灵感库](../web/components/inspiration-gallery.tsx) | [个人提示词](../server/internal/studio/personal_prompts.go)、[反推任务](../server/internal/studio/prompt_reverse_worker.go)、[投稿审核](../server/internal/studio/inspiration_submission_review.go)、[内置清单与来源](../server/seed) |
| 账号与运营后台 | [用户会话](../web/components/account-provider.tsx)、[独立后台路由](../admin/src/main.tsx)、[后台页面](../admin/src/app/admin) | [用户登录](../server/internal/studio/auth_handlers.go)、[管理员登录](../server/internal/studio/admin_auth.go)、[后台 API 路由](../server/internal/httpapi/admin_routes.go) |

追踪一个 API 请求时，从 [Gin 路由](../server/internal/httpapi/routes.go)找到路径，再看[路由绑定](../server/internal/studio/routes.go)对应的业务方法。进程启动、数据库迁移和 Worker 启动集中在 [app.go](../server/internal/app/app.go)，表结构变更按顺序放在[数据库迁移目录](../server/internal/database/migrations)。

生图任务的状态和预留积分保存在 PostgreSQL。Redis 通知 [Worker](../server/internal/studio/queue.go) 领取任务，进程重启后由[恢复逻辑](../server/internal/studio/queue_recovery.go)重新扫描数据库。用户反馈“余额减少但还没看到图片”时，可沿同一任务 ID 核对预留记录、逐张交付记录和最终结算。

安装、使用与运维手册汇总在[文档目录](README.md)。公共库导入导出、开发数据维护及镜像验收工具放在 [scripts](../scripts)。构建应用镜像从 [Dockerfile](../docker/image.Dockerfile) 开始，发布流程见 [GitHub Actions 工作流](../.github/workflows/docker-image.yml)。

### 各部署方式的后台入口

| 启动方式 | `/admin` 由谁提供 |
| --- | --- |
| 根目录 [compose.yml](../compose.yml) | [镜像内 Caddy](../docker/Caddyfile.image)提供 `admin/` 构建的静态页面。后台与网站共用端口，默认 8080。 |
| [本地开发 Compose](../docker/docker-compose.yml) | 独立后台默认在 33001，前台默认在 33000，前台端口上的 `/admin` 仍由 [Next.js 后台](../web/app/admin)处理。 |
| [分服务生产](../docker/Caddyfile)与[宝塔部署](../docker/Caddyfile.internal) | 网关将 `/admin` 转发给 `web:3000`，使用 Next.js 后台。 |
| [dev.sh](../dev.sh) | 脚本启动 API 与 Next.js。联调独立后台时另行启动 [admin 开发服务](../admin/README.md)，将 `ADMIN_API_PROXY` 指向脚本启动的 API，默认 `http://127.0.0.1:4000`。 |

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

独立后台使用自己的依赖与锁文件。在仓库根目录执行以下命令，`build` 包含 TypeScript 检查。

```sh
cd admin
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

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
