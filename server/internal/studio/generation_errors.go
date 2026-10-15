package studio

import "strings"

// Provider bodies and transport errors may contain channel URLs, signed image
// links, credentials or internal model names. Return only fixed user-facing text.
func publicGenerationError(message string) string {
	if message == "" {
		return ""
	}
	for _, safe := range []string{
		"提示词或参考图未通过生成服务的内容检查，请调整后重试。",
		"生成服务处理超时，请稍后重试；已完成的图片会保留。",
		"生成服务请求较多，请稍后重试。",
		"生成服务暂时不可用，请联系管理员检查服务配置。",
		"任务处理已中断，已完成的图片会保留，可重新发起生成。",
		"参考图片无法读取，请重新选择素材。",
	} {
		if message == safe {
			return safe
		}
	}
	text := strings.ToLower(message)
	switch {
	case strings.Contains(text, "safety"), strings.Contains(text, "content policy"), strings.Contains(text, "内容安全"):
		return "提示词或参考图未通过生成服务的内容检查，请调整后重试。"
	case strings.Contains(text, "timeout"), strings.Contains(text, "timed out"), strings.Contains(text, "deadline"), strings.Contains(text, "超时"):
		return "生成服务处理超时，请稍后重试；已完成的图片会保留。"
	case strings.Contains(text, "429"), strings.Contains(text, "rate limit"), strings.Contains(text, "限流"):
		return "生成服务请求较多，请稍后重试。"
	case strings.Contains(text, "quota"), strings.Contains(text, "insufficient"), strings.Contains(text, "401"), strings.Contains(text, "unauthorized"):
		return "生成服务暂时不可用，请联系管理员检查服务配置。"
	case strings.Contains(text, "中断"):
		return "任务处理已中断，已完成的图片会保留，可重新发起生成。"
	default:
		return "图片生成失败，请稍后重试；已完成的图片会保留。"
	}
}
