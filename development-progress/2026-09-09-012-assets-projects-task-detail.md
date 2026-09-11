# 012 资产、项目与任务详情闭环

> 日期：2026-09-09  
> 状态：已完成

## 实现内容

- `POST /v1/assets`：登录后 multipart 上传图片到本地 `storage/uploads`。
- 上传限制：JPG/JPEG、PNG、WebP；单文件最大 10MB。
- `GET /v1/assets`：查询当前用户资产。
- `POST /v1/projects`：创建项目。
- `GET /v1/projects`：查询当前用户项目。
- 生成任务支持 `projectId` 关联并写入 PostgreSQL。
- 任务查询增加项目关联字段和用户隔离。
- 新增前端 `/tasks/[id]` 任务详情页，展示状态、参数和 AI 未接入提示。
- PostgreSQL 自动创建 `projects`、`assets` 并扩展 `generation_tasks` 外键。

## 验证结果

- `go test ./...` 通过。
- `go build ./...` 通过。
- `pnpm build` 通过，任务详情路由成功生成。
- PostgreSQL migration 启动逻辑成功执行。

## 限制

- 上传文件暂存本地磁盘，未接入 S3/OSS/MinIO。
- 项目与资产已有 API，前端管理列表仍待完善。
- 任务创建暂未从前端选择项目，默认可为空。
- AI 生图仍未调用。

## 下一步

- 前端项目/资产页面和上传组件。
- 任务创建时选择项目并显示任务详情链接。
- 对象存储适配器和图片元数据解析。
