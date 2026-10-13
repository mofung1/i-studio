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
	return strings.Join(parts, "\n\n"), buildPromptUserText(target, text, r, promptSet(b.templates))
}
func (s *server) buildPrompt(target, text string, r *http.Request) (string, string, error) {
	templates, err := s.promptSnapshot()
	if err != nil {
		return "", "", err
	}
	system, user := (promptBuilder{templates}).build(target, text, r)
	return system, user, nil
}
