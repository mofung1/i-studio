# iStudio Nova UI

这是基于 Appica UI 重新设计的 iStudio 独立前端版本。原有 `apps/web` 保持不变；本目录保留现有页面路由、业务参数、登录流程和 API 调用，仅替换视觉层与组件样式。

## 本地运行

```bash
cd ui
pnpm install
cp .env.local.example .env.local
pnpm dev
```

默认访问 `http://127.0.0.1:3000`。API 地址通过 `NEXT_PUBLIC_API_BASE_URL` 配置，默认指向 `http://127.0.0.1:4000`。

## Appica UI

界面使用 `@appica/ui-react`，入口样式在 `app/globals.css` 中引入，根布局通过 `ThemeProvider` 提供主题上下文。

## 校验

```bash
pnpm typecheck
pnpm test
pnpm build
```
