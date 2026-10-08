package main

import (
	"context"
	"strings"
)

type promptImage struct{ Mime, Data string }
type promptCompleter interface {
	complete(context.Context, string, string, []promptImage, int) (string, error)
	modelName() string
}

func sanitizeModelText(text string) string {
	trimmed := strings.TrimSpace(text)
	if strings.HasPrefix(trimmed, "```") {
		if index := strings.Index(trimmed, "\n"); index >= 0 {
			trimmed = trimmed[index+1:]
		}
		trimmed = strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(trimmed), "```"))
	}
	return strings.Trim(trimmed, "\"'“”")
}
