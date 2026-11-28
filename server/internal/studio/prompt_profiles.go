package studio

import "strings"

const (
	geminiPromptBudgetRunes = 1400
	openAIPromptBudgetRunes = 2400
)

type promptModelProfile struct {
	Key      string
	MaxRunes int
}

// promptModelProfileFor 按协议和模型名估算提示词预算。
// Gemini 图像模型对长提示词更敏感，先收紧到 1400 字；其余保留 2400 字。
func promptModelProfileFor(input map[string]any) promptModelProfile {
	protocol := strings.ToLower(stringValue(input["protocol"], ""))
	model := strings.ToLower(stringValue(input["model"], ""))
	if protocol == "gemini_native" || strings.Contains(model, "gemini") {
		return promptModelProfile{Key: "gemini", MaxRunes: geminiPromptBudgetRunes}
	}
	return promptModelProfile{Key: "openai", MaxRunes: openAIPromptBudgetRunes}
}

// platformPromptText 返回平台的具体构图建议；没有专属配置时退回平台名称。
func platformPromptText(input map[string]any) string {
	platform := strings.TrimSpace(stringValue(input["platform"], ""))
	if platform == "" {
		return ""
	}
	if text := strings.TrimSpace(generationText(input, "platform."+platform)); text != "" {
		return text
	}
	if name := promptPlatformLabels[platform]; name != "" {
		return "适配目标平台：" + name
	}
	return ""
}
