package studio

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// Chat image generation uses the documented OpenRouter-compatible multimodal
// contract. Other vendor-specific chat extensions must be verified separately.
func (p *imageProtocolTransport) submitChat(ctx context.Context, model, prompt string, input map[string]any) (providerTask, error) {
	parts := []map[string]any{{"type": "text", "text": prompt}}
	for _, image := range sourceImages(input) {
		parts = append(parts, map[string]any{"type": "image_url", "image_url": map[string]string{"url": "data:" + image["mime"] + ";base64," + image["data"]}})
	}
	config := map[string]any{"aspect_ratio": stringValue(input["aspectRatio"], "1:1"), "image_size": stringValue(input["resolution"], "1K")}
	body := map[string]any{"model": model, "messages": []any{map[string]any{"role": "user", "content": parts}}, "modalities": []string{"image", "text"}, "image_config": config, "stream": false}
	return p.submitJSON(ctx, "v1/chat/completions", input, body, false)
}
func parseChatImages(raw []byte, key string) (providerTask, error) {
	var payload struct {
		Choices []struct {
			FinishReason string `json:"finish_reason"`
			Message      struct {
				Images  []json.RawMessage `json:"images"`
				Content json.RawMessage   `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return providerTask{}, err
	}
	images := []string{}
	parse := func(block json.RawMessage) error {
		var b struct {
			Type     string          `json:"type"`
			ImageURL json.RawMessage `json:"image_url"`
			URL      string          `json:"url"`
			B64      string          `json:"b64_json"`
			MIME     string          `json:"mime_type"`
		}
		if err := json.Unmarshal(block, &b); err != nil {
			return err
		}
		value := b.URL
		if len(b.ImageURL) > 0 {
			var nested struct {
				URL string `json:"url"`
			}
			if json.Unmarshal(b.ImageURL, &nested) == nil {
				value = nested.URL
			} else {
				_ = json.Unmarshal(b.ImageURL, &value)
			}
		}
		if value == "" && b.B64 != "" {
			mime := b.MIME
			if mime == "" {
				mime = "image/png"
			}
			value = "data:" + mime + ";base64," + b.B64
		}
		if value != "" {
			if !strings.HasPrefix(value, "https://") && !strings.HasPrefix(value, "http://") && !strings.HasPrefix(value, "data:image/") {
				return fmt.Errorf("Chat 返回不支持的图片地址")
			}
			images = append(images, value)
		}
		return nil
	}
	for _, choice := range payload.Choices {
		if choice.FinishReason == "content_filter" || choice.FinishReason == "length" {
			return providerTask{}, fmt.Errorf("Chat 图片输出被拒绝或截断: %s", choice.FinishReason)
		}
		for _, b := range choice.Message.Images {
			if err := parse(b); err != nil {
				return providerTask{}, err
			}
		}
		var blocks []json.RawMessage
		if json.Unmarshal(choice.Message.Content, &blocks) == nil {
			for _, b := range blocks {
				if err := parse(b); err != nil {
					return providerTask{}, err
				}
			}
		}
	}
	if len(images) == 0 {
		return providerTask{}, fmt.Errorf("Chat 返回了不支持的响应：未找到多模态图片输出")
	}
	return providerTask{Status: "success", Images: images}, nil
}
func validateImageProtocolParameters(protocol string, input map[string]any) error {
	switch protocol {
	case "openai_images", "openai_chat", "gemini_native":
	default:
		return fmt.Errorf("不支持的生图协议 %q", protocol)
	}
	ratio := stringValue(input["aspectRatio"], "1:1")
	resolution := stringValue(input["resolution"], "1K")
	if _, ok := allowedRatios[ratio]; !ok && ratio != "2:3" {
		return fmt.Errorf("不支持的图片比例 %q", ratio)
	}
	if _, ok := allowedResolutions[resolution]; !ok && resolution != "auto" {
		return fmt.Errorf("不支持的图片分辨率 %q", resolution)
	}
	if protocol != "openai_images" && resolution == "auto" {
		return fmt.Errorf("当前协议不支持自动分辨率")
	}
	for _, image := range sourceImages(input) {
		if extensionForMime(image["mime"]) == "" {
			return fmt.Errorf("不支持的参考图 MIME %q", image["mime"])
		}
	}
	return nil
}
