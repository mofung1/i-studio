package studio

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"
)

const textCompleteSystemPrompt = `你是文本处理助手。按用户给出的任务处理文本，只输出处理后的文本本身，不要解释、不要加标题、不要使用 Markdown。`

// textComplete 处理画布文本节点的「文生文」：一段文本 + 可选的任务说明，返回生成文本。
// 复用 prompt 文本模型的补全能力，图片不参与；结果一次性返回，不做流式。
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
		Text        string `json:"text"`
		Instruction string `json:"instruction"`
	}
	if !decode(r, &input) {
		s.error(w, http.StatusBadRequest, "TEXT_INPUT_INVALID", "请求内容无法解析，请重试")
		return
	}
	text := strings.TrimSpace(input.Text)
	if text == "" {
		s.error(w, http.StatusBadRequest, "TEXT_INPUT_EMPTY", "请先输入文本")
		return
	}
	if len([]rune(text)) > maxPromptTextRunes {
		s.error(w, http.StatusBadRequest, "TEXT_INPUT_TOO_LONG", "输入内容超过 10000 字，请精简后再试")
		return
	}

	var userText strings.Builder
	if instruction := strings.TrimSpace(input.Instruction); instruction != "" {
		userText.WriteString(instruction)
		userText.WriteString("\n\n")
	}
	userText.WriteString(text)

	uid, _ := s.authenticatedUserID(r)
	ctx, release, err := s.acquireAuxiliary(r.Context(), uid, "text_complete")
	if err != nil {
		s.auxiliaryFailure(w, err)
		return
	}
	defer release()

	result, err := s.promptClient.complete(ctx, textCompleteSystemPrompt, userText.String(), nil, 4096)
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
