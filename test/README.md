# 测试目录

这里统一保存测试生成的文件和检查记录。自动化测试源码仍随实现保存：后端使用 `server/internal/**/*_test.go`，前端使用 `web/**/*.test.ts` 和 `web/**/*.test.tsx`。

## 目录约定

| 目录 | 内容 | Git |
| --- | --- | --- |
| `reports/` | 功能回归、效果评估、界面测量和项目检查报告 | 提交 |
| `previews/` | 独立 HTML 原型及预览图，不属于生产页面 | 提交 |
| `artifacts/` | 测试截图、真实 AI 输出、样例素材、原始 JSON 及覆盖率报告 | 忽略 |
| `backups/` | 本地数据库迁移备份和核对记录 | 忽略 |

截图、样例和原始结果按 `<功能>-YYYY-MM-DD/` 分组；覆盖率报告使用 `artifacts/coverage/<项目>/`。记录中如需引用本地结果，使用相对路径。`artifacts/` 和 `backups/` 不随克隆仓库下载，整个 `test/` 均排除在 Docker 构建上下文外。

数据库备份可能包含账户哈希和私有配置，备份目录限制为仅当前用户访问，备份文件仅当前用户读写；新建目录使用 `mkdir -m 700`，备份前设置 `umask 077`。这里的备份不替代部署环境的定期备份。

运行中的上传图片和签名/加密密钥保存在 `server/storage/uploads/`；`.env`、数据库卷和依赖目录沿用各自位置。可重新生成的 `.next/`、`server/bin/` 等构建产物不归档到测试目录。

## 现有记录

- [生图真实账号复测（2026-10-19）](reports/generation-live-2026-10-19.md)
- [项目结构与安全检查（2026-10-15）](reports/project-review-2026-10-15.md)
- [早期项目检查（2026-10-12）](reports/project-review-2026-10-12.md)
- [电商工具真实出图对照](reports/commerce-effects-2026-10-13.md)
- [图片反推真实识图评估](reports/prompt-reverse-evaluation-2026-10-13.md)
- [资产、个人提示词与图片对比验证](reports/personal-workspace-2026-10-14.md)
- [界面打磨记录](reports/ui-polish-2026-10-13.md)
- [生成超时排查](reports/generation-timeout-2026-10-13.md)
- [生图图片区布局测量](reports/image-display-options-2026-10-13.md)
- [图片反推界面原型](previews/image-to-prompt-preview.html)

报告保留当时的版本、测试数量与限制；当前使用方法以根目录 README 和 `docs/` 为准。

## 运行自动测试

在项目根目录执行：

```bash
pnpm -C web typecheck
pnpm -C web format:check
pnpm -C web test
GOCACHE=/tmp/istudio-go-cache make -C server check
```

数据库回归通过 `TEST_DATABASE_URL` 启用，使用独立 schema 并自动清理，详见 [开发指南](../docs/development.md)。自动测试使用模拟 AI，不产生付费调用；真实出图或识图评估须先确认用量预算。
