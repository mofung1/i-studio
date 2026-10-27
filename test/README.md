# 测试说明

自动测试源码随实现保存：Go 使用 `server/internal/**/*_test.go`，前端使用 `web/**/*.test.ts` / `*.test.tsx`，维护脚本的测试位于 `scripts/test_*.py`。

在项目根目录执行：

```sh
pnpm -C web typecheck
pnpm -C web format:check
pnpm -C web test
go -C server test ./...
go -C server vet ./...
python3 -m unittest discover -s scripts -p 'test_*.py'
```

数据库回归通过 `TEST_DATABASE_URL` 启用，测试创建随机 schema 并自动清理。默认测试使用模拟服务，不产生真实 AI 费用；更多约定见 [开发指南](../docs/development.md)。

## Docker 安装验收

```sh
docker buildx build -f docker/image.Dockerfile -t istudio:local --load .
python3 scripts/test-docker-image.py --image istudio:local
```

验收从镜像导出 Compose，在随机项目名、独立数据卷和本机端口上安装。检查页面、管理员登录、全部公开提示词和封面、私有数据未打包、重建后的编辑/删除保留及故障恢复。脚本结束时只清理自己的测试项目。

## 临时文件

落盘产物使用 `test/artifacts/<功能或日期>/`，覆盖率目录为 `test/artifacts/coverage/web/`；这些产物不提交 Git，也不进入 Docker 上下文。README 正式截图保存在 `docs/images/screenshots/`。

本机备份可使用被忽略的 `test/backups/`，备份前设置 `umask 077`；它们不替代部署环境的定期备份。运行图片、配置和密钥仍保存在应用存储和数据库中。

历史报告、原型和本机测试产物已从项目移出。范围与恢复方式见 [文件维护](../docs/maintenance.md)。
