package studio

import (
	"fmt"
	"strings"
)

var allowedRatios = stringSet("1:1", "3:4", "4:3", "9:16", "16:9")

var allowedResolutions = stringSet("1K", "2K", "4K")

var allowedPlatforms = stringSet("smart", "taobao", "1688", "tmall", "pinduoduo", "jd", "douyin", "amazon", "temu", "ebay")

var allowedLanguages = stringSet("none", "zh-CN", "zh-TW", "en", "ja", "ko", "th", "ms", "id", "ru")

var allowedTasks = stringSet("product-main", "detail-page", "viral-recreate", "product-retouch", "clothing-set")

var allowedRecreateStrengths = stringSet("style", "high")

var allowedEnhancements = stringSet("gloss", "repair", "clarity", "color", "perspective", "background")

var allowedStyles = stringSet("unspecified", "studio", "minimal", "fresh", "technology", "guochao", "handdrawn")

var allowedReferenceStrengths = stringSet("low", "medium", "high")

func validateGenerationInput(input map[string]any) error {
	if input == nil {
		return fmt.Errorf("generation input must be an object")
	}
	if input["model"] == nil {
		input["model"] = "gpt-image-2"
	} else if err := requireText(input, "model", 1, 200); err != nil {
		return err
	}
	if input["endpointId"] != nil {
		if err := requireText(input, "endpointId", 1, 100); err != nil {
			return err
		}
	}
	if input["projectId"] != nil {
		if err := requireText(input, "projectId", 1, 200); err != nil {
			return err
		}
	}
	if err := requireOneOf(input, "aspectRatio", allowedRatios, "1:1"); err != nil {
		return err
	}
	if err := requireOneOf(input, "resolution", allowedResolutions, "2K"); err != nil {
		return err
	}
	if value, exists := input["count"]; exists {
		if !isJSONInteger(value) || value.(float64) < 1 || value.(float64) > 16 {
			return fmt.Errorf("count must be an integer between 1 and 16")
		}
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
		if err := requireOneOf(input, "style", allowedStyles, "unspecified"); err != nil {
			return err
		}
		if err := requireOneOf(input, "referenceStrength", allowedReferenceStrengths, "medium"); err != nil {
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
	count := intValue(input["count"], 1)
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
	requirementsLimit := 2000
	if taskType == "viral-recreate" || taskType == "product-retouch" {
		requirementsLimit = 1000
	}
	if input["requirements"] != nil {
		if err := requireText(input, "requirements", 0, requirementsLimit); err != nil {
			return err
		}
	}
	switch taskType {
	case "clothing-set":
		return validateClothingInput(input)
	case "product-main", "detail-page":
		if err := requireOneOf(input, "outputLanguage", allowedLanguages, "none"); err != nil {
			return err
		}
		if err := requireOneOf(input, "moduleMode", stringSet("smart", "custom"), "smart"); err != nil {
			return err
		}
		moduleTotal := 0
		countProvided := input["count"] != nil
		if input["moduleCounts"] != nil {
			if _, ok := input["moduleCounts"].(map[string]any); !ok {
				return fmt.Errorf("moduleCounts must be an object")
			}
		}
		if counts, ok := input["moduleCounts"].(map[string]any); ok {
			allowed := allowedModules[taskType]
			for key, value := range counts {
				if !isJSONInteger(value) {
					return fmt.Errorf("moduleCounts contains invalid %s", key)
				}
				number := int(value.(float64))
				if number < 1 || number > 4 {
					return fmt.Errorf("moduleCounts contains invalid %s", key)
				}
				moduleTotal += number
				if allowed != nil {
					if _, supported := allowed[key]; !supported {
						return fmt.Errorf("unsupported module %q", key)
					}
				}
			}
		}
		if moduleTotal > 16 {
			return fmt.Errorf("moduleCounts total must not exceed 16")
		}
		if stringValue(input["moduleMode"], "smart") == "custom" {
			if moduleTotal == 0 {
				return fmt.Errorf("custom module mode requires at least one module")
			}
			if !countProvided {
				count = moduleTotal
				input["count"] = float64(moduleTotal)
			} else if count != moduleTotal {
				return fmt.Errorf("count must equal the total of moduleCounts in custom module mode")
			}
		}
		return nil
	case "viral-recreate":
		if err := requireOneOf(input, "outputLanguage", allowedLanguages, "none"); err != nil {
			return err
		}
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
	raw, exists := input[key]
	value, ok := raw.(string)
	if !exists || (ok && value == "") {
		if fallback != "" {
			input[key] = fallback
			return nil
		}
		return fmt.Errorf("%s is required", key)
	}
	if !ok {
		return fmt.Errorf("%s must be a string", key)
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
