# iStudio

iStudio 是面向国内和跨境电商团队的 AI 图片创作平台。正式项目采用 pnpm workspace 与 Turborepo 管理，`UI/` 目录仅作为高保真原型和视觉参考。

## 目录

```text
apps/web              Next.js 用户端
apps/api              NestJS API
packages/ui           共享 UI 组件
packages/contracts    Zod 业务契约
packages/config       共享工程配置
infra/docker          本地 PostgreSQL / Redis
development-progress  开发进度与决策记录
docs                  产品需求文档
UI                    UI 原型，不作为正式运行入口
```

## 本地开发

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Web 默认运行在 `http://127.0.0.1:3000`，API 默认运行在 `http://127.0.0.1:4000`。

本地数据库与 Redis：

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

当前阶段不需要 AI API Key。开始接入 BananaRouter 前会先确认接口能力、模型参数和密钥配置。

