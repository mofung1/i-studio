# iStudio

iStudio 是面向国内和跨境电商团队的 AI 图片创作平台。正式项目采用 pnpm workspace 与 Turborepo 管理，`UI/` 目录仅作为高保真原型和视觉参考。

## 目录

```text
apps/web              Next.js 用户端
apps/server           Go API server
packages/ui           共享 UI 组件
packages/contracts    Zod 业务契约
packages/config       共享工程配置
infra/docker          本地 PostgreSQL / Redis
development-progress  开发进度与决策记录
docs                  产品需求文档
UI                    UI 原型，不作为正式运行入口
```

## 本地开发

推荐使用一键启动脚本：

```bash
pnpm dev:test
```

脚本会创建缺失的本地环境文件、启动 PostgreSQL/Redis、Go API 和 Next.js Web。按 `Ctrl+C` 会停止 Web 与 API；数据库容器会继续运行以保留测试数据。已经自行启动基础设施时可运行 `./scripts/start-test.sh --no-infra`。

首次运行前安装依赖：

```bash
pnpm install
cp apps/web/.env.local.example apps/web/.env.local
pnpm dev
```

后端配置单独放在 `apps/server/.env`：

```bash
cp apps/server/.env.example apps/server/.env
```

在后端 `.env` 中填写 `BANANA_ROUTER_API_KEY`。不要把供应商密钥放在前端环境变量中；未配置时工作台会明确阻止提交，不会创建永久等待的任务。

Web 默认运行在 `http://127.0.0.1:3000`，API 默认运行在 `http://127.0.0.1:4000`。

本地数据库与 Redis：

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

## 交付验证

```bash
pnpm typecheck
pnpm test
pnpm build
GOCACHE=/tmp/istudio-go-cache go -C apps/server test -race ./...
```

Gemini 图片模型使用 BananaRouter 的 `generateContent` 接口，并支持把已上传商品图和参考图以内联图片形式传给模型。真实生图会产生供应商费用，自动化验收默认不会发起付费请求。
