package config

import (
	"bufio"
	"os"
	"strings"
)

func Env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// Load simple KEY=VALUE entries so the standalone Go service shares the repo .env convention.
func LoadDotEnv(paths ...string) {
	// The API owns its secrets; never fall back to the workspace root .env.
	if len(paths) == 0 {
		if info, err := os.Stat("server"); err == nil && info.IsDir() {
			paths = []string{"server/.env"}
		} else {
			paths = []string{".env"}
		}
	}
	for _, path := range paths {
		file, err := os.Open(path)
		if err != nil {
			continue
		}
		defer file.Close()
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) != 2 {
				continue
			}
			key, value := strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
			value = strings.Trim(value, "\"'")
			if key != "" && os.Getenv(key) == "" {
				_ = os.Setenv(key, value)
			}
		}
		return
	}
}
