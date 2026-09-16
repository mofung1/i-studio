# iStudio

面向国内和跨境电商团队的 AI 图片创作平台。

## 目录结构

```text
apps/web     Next.js 用户端（独立 pnpm 项目）
apps/server  Go API server
docker       Docker Compose（PostgreSQL / Redis / API / Web）
```

## 本地开发

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
