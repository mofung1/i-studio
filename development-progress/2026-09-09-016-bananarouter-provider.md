# 2026-09-09  BananaRouter Provider 适配

## 已完成

- 核对 GPT Image 2、Gemini 2.5 Flash Image、Gemini 3.1 Flash Image Preview、Gemini 3 Pro Image Preview 及异步任务文档。
- 新增 `apps/server/provider.go`，定义 `imageProvider` 接口及 BananaRouter 实现。
- GPT 文生图使用 `/v1/images/generations/async`，参考图编辑使用 multipart `/v1/images/edits/async`，参考图以可重复的 `image` 字段上传；Gemini 模型使用 `/v1beta/models/{model}:generateContent`。
- 统一通过 `/v1/async-tasks/{taskID}` 轮询，间隔 5 秒，最多 24 次。
- 同步 Gemini 请求超时通过 `BANANA_ROUTER_TIMEOUT_SECONDS` 配置，默认 300 秒。
- 增加模型与尺寸映射：GPT 使用 OpenAI `size`，Gemini 使用 `imageConfig.aspectRatio/imageSize`。
- 任务表增加 `result_images`、`error_message` 字段，任务详情可读取真实结果元数据。
- 未配置 `BANANA_ROUTER_API_KEY` 时不发起任何供应商请求，保留本地演示状态。

## 验证

```bash
GOCACHE=/tmp/istudio-go-cache go test ./...
GOCACHE=/tmp/istudio-go-cache go build ./...
```

均通过。

## 待用户确认

真实调用前需要提供 `BANANA_ROUTER_API_KEY`，并确认先用哪个模型做最小额度验证。当前实现默认使用异步接口，结果图片以 BananaRouter 返回的 OSS URL 记录；拿到密钥后再验证供应商实际授权模型、可用尺寸及余额/限流行为。
