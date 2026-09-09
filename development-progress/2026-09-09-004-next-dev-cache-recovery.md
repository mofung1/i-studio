# 004 Next.js 开发缓存恢复

> 日期：2026-09-09  
> 状态：已完成

## 问题

开发服务器运行期间执行生产构建，`next dev` 与 `next build` 同时写入 `apps/web/.next`，造成开发服务缺少 chunk 和 manifest，首页返回 Internal Server Error。

## 处理

- 停止旧开发服务。
- 执行 `pnpm --filter @istudio/web clean` 清理 `.next` 构建缓存。
- 重新执行 `pnpm dev:web`。
- 浏览器验证首页、模型、比例和分辨率控件均正常显示。

## 后续约束

运行 `pnpm build` 前先停止 `pnpm dev:web`；如再次出现 chunk/manifest 缺失，清理 `.next` 后重新启动开发服务。
