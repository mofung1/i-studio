package main

import (
	"net/http"
	"strings"
)

type promptBuilder struct{ templates []promptTemplate }

func (b promptBuilder) build(target, text string, r *http.Request) (string, string) {
	key := "rewrite"
	if target == "requirements" {
		key = "requirements"
	}
	mode := strings.TrimSpace(r.FormValue("taskType"))
	parts := []string{}
	for _, wanted := range []string{key, mode} {
		for _, t := range b.templates {
			if t.Key == wanted && t.Enabled {
				parts = append(parts, t.Content)
				break
			}
		}
	}
	return strings.Join(parts, "\n\n"), buildPromptUserText(target, text, r)
}
func (s *server) buildPrompt(target, text string, r *http.Request) (string, string, error) {
	if s.ai == nil {
		system, user := (promptBuilder{defaultPromptTemplates()}).build(target, text, r)
		return system, user, nil
	}
	var templates []promptTemplate
	err := s.ai.withConfig(false, func(state *aiConfiguration) error { templates = state.Templates; return nil })
	if err != nil {
		return "", "", err
	}
	system, user := (promptBuilder{templates}).build(target, text, r)
	return system, user, nil
}
