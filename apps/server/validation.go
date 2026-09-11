package main

import (
	"fmt"
	"strings"
)

var allowedModels = stringSet("gpt-image-2", "gemini-2.5-flash-image", "gemini-3.1-flash-image", "gemini-3-pro-image")
var allowedRatios = stringSet("1:1", "3:4", "4:3", "9:16", "16:9")
var allowedResolutions = stringSet("1K", "2K", "4K")
var allowedPlatforms = stringSet("taobao-tmall", "jd", "pinduoduo", "douyin", "xiaohongshu", "amazon", "shopify", "generic")
var allowedLanguages = stringSet("zh-CN", "zh-TW", "en")
var allowedTasks = stringSet("white-background", "scene", "selling-point", "detail-page")
var allowedModules = stringSet("hero", "core-selling-point", "usage-scene", "multi-angle", "specification", "material", "accessories")

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
	if count < 1 || count > 4 || (input["count"] != nil && !isJSONInteger(input["count"])) {
		return fmt.Errorf("count must be an integer between 1 and 4")
	}
	mode, ok := input["mode"].(string)
	if !ok {
		return fmt.Errorf("mode is required")
	}
	switch mode {
	case "general":
		if err := requireText(input, "prompt", 1, 4000); err != nil {
			return err
		}
		return validateStringArray(input, "referenceAssetIds", 0, 4, 200)
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
	if err := validateStringArray(input, "productAssetIds", 1, 10, 200); err != nil {
		return err
	}
	if err := requireText(input, "productName", 1, 100); err != nil {
		return err
	}
	if err := requireText(input, "productCategory", 1, 100); err != nil {
		return err
	}
	if err := requireOneOf(input, "platform", allowedPlatforms, "generic"); err != nil {
		return err
	}
	taskType, _ := input["taskType"].(string)
	switch taskType {
	case "scene":
		if err := requireText(input, "sceneDescription", 1, 1000); err != nil {
			return err
		}
		return validateStringArray(input, "referenceAssetIds", 0, 4, 200)
	case "selling-point":
		if err := validateStringArray(input, "sellingPoints", 1, 8, 50); err != nil {
			return err
		}
		return requireOneOf(input, "outputLanguage", allowedLanguages, "zh-CN")
	case "detail-page":
		if err := requireOneOf(input, "module", allowedModules, ""); err != nil {
			return err
		}
		if err := validateStringArray(input, "sellingPoints", 0, 8, 50); err != nil {
			return err
		}
		return requireOneOf(input, "outputLanguage", allowedLanguages, "zh-CN")
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
