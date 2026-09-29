# iStudio

面向国内和跨境电商团队的 AI 图片创作平台。

## 目录结构

```text
apps/web     Next.js 用户端（独立 pnpm 项目）
apps/server  Go API server
docker       Docker Compose（PostgreSQL / Redis / API / Web）
ui           Appica Nova 版前端（保留原路由与业务逻辑的换肤版）
UI-1         灯箱与工单版前端（无落地页，首页即工作台）
UI-2         柔光台版前端（浅色玻璃 + 柔和彩色，先做生成页与登录页）
UI-3         黑白工坊版前端（黑白主题 + 柠檬黄点缀，先做生成页与登录页）
UI-4         Studio Calm 版前端（简约大气、雾蓝与薄荷色点缀，当前只设计生图主页）
```

## 本地开发

### 前后端一键启动（dev.sh）

```bash
./dev.sh              # 前端 http://127.0.0.1:3000 + API http://127.0.0.1:4000
./dev.sh --infra      # 顺带用 Docker 起 postgres / redis（数据持久化）
./dev.sh --web-port 3100 --api-port 4100   # 自定义端口（会自动放行 CORS 来源）
./dev.sh --no-install # 跳过 pnpm install
```

脚本会做的事：检查 `go`/`node`/`pnpm` 与端口占用、提示 `.env` 里缺失的密钥、探测 Postgres/Redis 是否可达（连不上会说明会降级成内存存储 / 进程内队列）、编译后端二进制后与 Next dev 一起启动，日志分别带 `[api]` / `[web]` 前缀；按 `Ctrl+C` 同时停掉两端并释放端口。

### Docker 一键启动（推荐）

```bash
cd docker
docker compose up --build
```

同时启动 PostgreSQL、Redis、Go API 和 Next.js Web。默认端口：

| 服务 | 端口 |
| --- | --- |
| Web | `33000` |
| API | `44000` |
| PostgreSQL | `55432` |
| Redis | `56379` |

可通过环境变量覆盖（`WEB_PORT`、`API_PORT`、`POSTGRES_PORT`、`REDIS_PORT`）。前台运行时按 `Ctrl+C` 停止整组服务；数据保存在 Docker volumes 中，下次启动仍保留。

### 前端单独开发

```bash
cd apps/web
pnpm install
pnpm dev
```

默认运行在 http://127.0.0.1:3000。

### 后端

```bash
cd apps/server
cp .env.example .env   # 在其中填写 BANANA_ROUTER_API_KEY
go run .
```

不要把供应商密钥放在前端环境变量中；未配置时工作台会明确阻止提交，不会创建永久等待的任务。

## 交付验证

```bash
cd apps/web && pnpm typecheck && pnpm test && pnpm build
GOCACHE=/tmp/istudio-go-cache go -C apps/server test -race ./...
```

Gemini 图片模型使用 BananaRouter 的 `generateContent` 接口，并支持把已上传商品图和参考图以内联图片形式传给模型。真实生图会产生供应商费用，自动化验收默认不会发起付费请求。
