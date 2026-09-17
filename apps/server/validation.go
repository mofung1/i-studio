package main

import (
	"fmt"
	"strings"
)

var allowedModels = stringSet("gpt-image-2", "gemini-2.5-flash-image", "gemini-3.1-flash-image", "gemini-3-pro-image")
var allowedRatios = stringSet("1:1", "3:4", "4:3", "9:16", "16:9")
var allowedResolutions = stringSet("1K", "2K", "4K")
var allowedPlatforms = stringSet("smart", "taobao", "1688", "tmall", "pinduoduo", "jd", "douyin", "amazon", "temu", "ebay")
var allowedLanguages = stringSet("none", "zh-CN", "zh-TW", "en", "ja", "ko", "th", "ms", "id", "ru")
var allowedTasks = stringSet("product-main", "detail-page", "viral-recreate", "product-retouch")
var allowedRecreateStrengths = stringSet("style", "high")
var allowedEnhancements = stringSet("gloss", "repair", "clarity", "color", "perspective", "background")

func validateGenerationInput(input map[string]any) error {
	if err := requireOneOf(input, "model", allowedModels, "gpt-image-2"); err != nil {
		return err
	}
	if err := requireOneOf(input, "aspectRatio", allowedRatios, "1:1"); err != nil {
		return err
	}
	if err := requireOneOf(input, "resolution", allowedResolutions, "2K"); err != nil {
		return err
	}
	count := intValue(input["count"], 1)
	if count < 1 || count > 16 || (input["count"] != nil && !isJSONInteger(input["count"])) {
		return fmt.Errorf("count must be an integer between 1 and 16")
	}
	mode, ok := input["mode"].(string)
	if !ok {
		return fmt.Errorf("mode is required")
	}
	switch mode {
	case "general":
		if err := requireText(input, "prompt", 1, 10000); err != nil {
			return err
		}
		return validateStringArray(input, "referenceAssetIds", 0, 6, 200)
	case "commerce":
		return validateCommerceInput(input)
	default:
		return fmt.Errorf("unsupported mode %q", mode)
	}
}

func validateCommerceInput(input map[string]any) error {
	if err := requireOneOf(input, "taskType", allowedTasks, ""); err != nil {
		return err
	}
	if err := validateStringArray(input, "productAssetIds", 1, 6, 200); err != nil {
		return err
	}
	if err := requireOneOf(input, "platform", allowedPlatforms, "smart"); err != nil {
		return err
	}
	taskType, _ := input["taskType"].(string)
	switch taskType {
	case "product-main", "detail-page":
		if err := requireOneOf(input, "outputLanguage", allowedLanguages, "none"); err != nil {
			return err
		}
		if err := requireOneOf(input, "moduleMode", stringSet("smart", "custom"), "smart"); err != nil {
			return err
		}
		if counts, ok := input["moduleCounts"].(map[string]any); ok {
			allowed := allowedModules[taskType]
			for key, value := range counts {
				number, valid := value.(float64)
				if !valid || number < 1 || number > 4 {
					return fmt.Errorf("moduleCounts contains invalid %s", key)
				}
				if allowed != nil {
					if _, supported := allowed[key]; !supported {
						return fmt.Errorf("unsupported module %q", key)
					}
				}
			}
		}
		return nil
	case "viral-recreate":
		if err := validateStringArray(input, "referenceAssetIds", 1, 1, 200); err != nil {
			return err
		}
		return requireOneOf(input, "recreateStrength", allowedRecreateStrengths, "style")
	case "product-retouch":
		values, exists := input["enhancements"]
		if !exists {
			input["enhancements"] = []any{}
			return nil
		}
		items, ok := values.([]any)
		if !ok {
			return fmt.Errorf("enhancements must be an array")
		}
		for _, item := range items {
			value, ok := item.(string)
			if !ok {
				return fmt.Errorf("enhancements contains an invalid item")
			}
			if _, valid := allowedEnhancements[value]; !valid {
				return fmt.Errorf("unsupported enhancement %q", value)
			}
		}
		return nil
	default:
		return nil
	}
}

func requireText(input map[string]any, key string, minimum, maximum int) error {
	value, ok := input[key].(string)
	length := len([]rune(strings.TrimSpace(value)))
	if !ok || length < minimum || length > maximum {
		return fmt.Errorf("%s must contain %d-%d characters", key, minimum, maximum)
	}
	return nil
}

func requireOneOf(input map[string]any, key string, allowed map[string]struct{}, fallback string) error {
	value, ok := input[key].(string)
	if !ok || value == "" {
		if fallback != "" {
			input[key] = fallback
			return nil
		}
		return fmt.Errorf("%s is required", key)
	}
	if _, ok := allowed[value]; !ok {
		return fmt.Errorf("unsupported %s %q", key, value)
	}
	return nil
}

func validateStringArray(input map[string]any, key string, minimum, maximum, itemMaximum int) error {
	value, exists := input[key]
	if !exists {
		if minimum == 0 {
			input[key] = []any{}
			return nil
		}
		return fmt.Errorf("%s is required", key)
	}
	items, ok := value.([]any)
	if !ok || len(items) < minimum || len(items) > maximum {
		return fmt.Errorf("%s must contain %d-%d items", key, minimum, maximum)
	}
	for _, item := range items {
		text, ok := item.(string)
		if !ok || strings.TrimSpace(text) == "" || len([]rune(text)) > itemMaximum {
			return fmt.Errorf("%s contains an invalid item", key)
		}
	}
	return nil
}

func isJSONInteger(value any) bool {
	number, ok := value.(float64)
	return ok && number == float64(int(number))
}

func stringSet(values ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}
