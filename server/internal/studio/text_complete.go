package studio

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
)

const textCompleteSystemPrompt = `你是文本处理助手。按用户给出的任务处理文本（可参考用户提供的图片），只输出处理后的文本本身，不要解释、不要加标题、不要使用 Markdown。`

// textComplete 处理画布文本节点的「文生文 / 图生文」：一段文本 + 可选任务说明 + 可选参考图，返回生成文本。
// 复用 prompt 文本模型的补全能力；带参考图时要求模型支持识图。结果一次性返回，不做流式。
func (s *Service) textComplete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	if !s.requireAuxiliaryUser(w, r) {
		return
	}
	if s.promptClient == nil || (s.ai != nil && !s.ai.hasAny("prompt")) {
		s.error(w, http.StatusServiceUnavailable, "TEXT_AI_UNAVAILABLE", "请先在设置中配置提示词 AI 服务")
		return
	}

	var input struct {
		Text          string   `json:"text"`
		Instruction   string   `json:"instruction"`
		ImageAssetIDs []string `json:"imageAssetIds"`
	}
	if !decode(r, &input) {
		s.error(w, http.StatusBadRequest, "TEXT_INPUT_INVALID", "请求内容无法解析，请重试")
		return
	}
	text := strings.TrimSpace(input.Text)
	if text == "" && len(input.ImageAssetIDs) == 0 {
		s.error(w, http.StatusBadRequest, "TEXT_INPUT_EMPTY", "请先输入文本或提供参考图片")
		return
	}
	if len([]rune(text)) > maxPromptTextRunes {
		s.error(w, http.StatusBadRequest, "TEXT_INPUT_TOO_LONG", "输入内容超过 10000 字，请精简后再试")
		return
	}

	uid, _ := s.authenticatedUserID(r)
	images, err := s.loadTextReferenceImages(uid, input.ImageAssetIDs)
	if err != nil {
		s.error(w, http.StatusBadRequest, "TEXT_IMAGE_INVALID", err.Error())
		return
	}
	if len(images) > 0 && s.ai != nil {
		endpoint, err := s.ai.resolve("prompt", "", "")
		if err != nil {
			s.error(w, http.StatusServiceUnavailable, "TEXT_AI_UNAVAILABLE", err.Error())
			return
		}
		if !endpoint.Capabilities["vision"] {
			s.error(w, http.StatusBadRequest, "TEXT_VISION_UNSUPPORTED", "当前文本模型不支持识别图片，无法图生文")
			return
		}
	}

	var userText strings.Builder
	if instruction := strings.TrimSpace(input.Instruction); instruction != "" {
		userText.WriteString(instruction)
		userText.WriteString("\n\n")
	}
	if text != "" {
		userText.WriteString(text)
	} else if len(images) > 0 {
		// 只有图片没有文字：默认任务为描述参考图片。
		userText.WriteString("请描述参考图片的内容。")
	}

	ctx, release, err := s.acquireAuxiliary(r.Context(), uid, "text_complete")
	if err != nil {
		s.auxiliaryFailure(w, err)
		return
	}
	defer release()

	result, err := s.promptClient.complete(ctx, textCompleteSystemPrompt, userText.String(), images, 4096)
	if err != nil {
		status, code, message := textCompleteError(err)
		log.Printf("text complete failed: code=%s model=%q", code, s.promptClient.modelName())
		s.error(w, status, code, message)
		return
	}
	result = strings.TrimSpace(result)
	if result == "" {
		s.error(w, http.StatusBadGateway, "TEXT_COMPLETE_EMPTY", "AI 没有返回内容，请重试")
		return
	}

	s.json(w, http.StatusOK, map[string]any{
		"text":  result,
		"model": s.promptClient.modelName(),
	})
}

// loadTextReferenceImages 把用户拥有的资产 ID 读成 base64 图片，供文本模型识图。
func (s *Service) loadTextReferenceImages(uid string, assetIDs []string) ([]promptImage, error) {
	if len(assetIDs) == 0 {
		return nil, nil
	}
	if len(assetIDs) > maxPromptImages {
		return nil, fmt.Errorf("最多选择 %d 张图片", maxPromptImages)
	}
	if s.storage == nil {
		return nil, fmt.Errorf("存储服务不可用")
	}
	images := make([]promptImage, 0, len(assetIDs))
	total := 0
	for _, id := range assetIDs {
		var key string
		var size int64
		if s.db == nil || s.db.QueryRow("SELECT storage_key,size_bytes FROM assets WHERE id=$1 AND user_id=$2", id, uid).Scan(&key, &size) != nil {
			return nil, fmt.Errorf("素材不存在或无权访问")
		}
		if size > maxPromptImageSize {
			return nil, errPromptImageTooLarge
		}
		reader, err := s.storage.Open(key)
		if err != nil {
			return nil, errPromptImageUnreadable
		}
		data, err := io.ReadAll(io.LimitReader(reader, maxPromptImageSize+1))
		_ = reader.Close()
		if err != nil || len(data) == 0 {
			return nil, errPromptImageUnreadable
		}
		if len(data) > maxPromptImageSize {
			return nil, errPromptImageTooLarge
		}
		if mime := http.DetectContentType(data); mime != "image/jpeg" && mime != "image/png" && mime != "image/webp" {
			return nil, fmt.Errorf("仅支持 JPG、PNG、WebP 图片")
		}
		total += len(data)
		if total > 20<<20 {
			return nil, fmt.Errorf("图片总计最多 20 MB")
		}
		images = append(images, promptImage{Mime: http.DetectContentType(data), Data: base64.StdEncoding.EncodeToString(data)})
	}
	return images, nil
}

// textCompleteError 只暴露可操作的信息，不泄露上游提供商细节或密钥。
func textCompleteError(err error) (int, string, string) {
	if errors.Is(err, context.DeadlineExceeded) {
		return http.StatusGatewayTimeout, "TEXT_COMPLETE_TIMEOUT", "AI 响应超时，请稍后重试"
	}
	var upstream *promptUpstreamError
	if errors.As(err, &upstream) {
		switch {
		case upstream.status == http.StatusTooManyRequests:
			return http.StatusTooManyRequests, "TEXT_COMPLETE_BUSY", "AI 服务繁忙或额度不足，请稍后重试，或在设置中检查服务额度"
		case upstream.status == http.StatusUnauthorized || upstream.status == http.StatusForbidden:
			return http.StatusServiceUnavailable, "TEXT_AI_AUTH_FAILED", "文本 AI 服务授权失败，请在设置中检查 API 密钥和模型权限"
		case upstream.kind == "length":
			return http.StatusBadGateway, "TEXT_COMPLETE_TRUNCATED", "AI 输出未完成，请精简输入后重试"
		case upstream.kind == "filter":
			return http.StatusBadRequest, "TEXT_COMPLETE_FILTERED", "AI 未能处理当前内容，请调整文字后重试"
		case upstream.status == http.StatusBadRequest || upstream.status == http.StatusNotFound || upstream.status == http.StatusUnprocessableEntity:
			return http.StatusBadGateway, "TEXT_AI_CONFIG_INVALID", "文本模型未接受请求，请检查设置中的模型和接口地址"
		}
	}
	return http.StatusBadGateway, "TEXT_COMPLETE_FAILED", "AI 服务暂时未返回有效结果，请稍后重试"
}
