package studio

import (
	"strings"
	"unicode/utf8"
)

// promptSection 是生成提示词中的一个语义块。
// priority 越大越不重要，超过模型预算时先删除。
type promptSection struct {
	key      string
	text     string
	priority int
	required bool
}

// promptPlan 按顺序组织提示词，并在超预算时保留身份、用户要求和文字政策。
type promptPlan struct {
	sections []promptSection
	maxRunes int
}

func (p *promptPlan) add(key, text string, priority int, required bool) {
	if text = strings.TrimSpace(text); text == "" {
		return
	}
	p.sections = append(p.sections, promptSection{key: key, text: text, priority: priority, required: required})
}

// render 去重后按加入顺序拼接；超预算时从最不重要的可选块开始删除。
// 必需块永不删除：商品身份、用户要求和文字政策比长度上限更重要。
func (p *promptPlan) render() string {
	sections := make([]promptSection, 0, len(p.sections))
	seen := make(map[string]bool, len(p.sections))
	for _, section := range p.sections {
		text := strings.TrimRight(strings.TrimSpace(section.text), "。；;，, ")
		if text == "" || seen[text] {
			continue
		}
		seen[text] = true
		section.text = text
		sections = append(sections, section)
	}
	if p.maxRunes > 0 {
		for promptPlanRunes(sections) > p.maxRunes {
			index := -1
			for i, section := range sections {
				if section.required {
					continue
				}
				if index < 0 || section.priority >= sections[index].priority {
					index = i
				}
			}
			if index < 0 {
				break
			}
			sections = append(sections[:index], sections[index+1:]...)
		}
	}
	texts := make([]string, len(sections))
	for i, section := range sections {
		texts[i] = section.text
	}
	return joinPromptParts(texts, "。")
}

func promptPlanRunes(sections []promptSection) int {
	total := 0
	for i, section := range sections {
		if i > 0 {
			total++
		}
		total += utf8.RuneCountInString(section.text)
	}
	return total
}
