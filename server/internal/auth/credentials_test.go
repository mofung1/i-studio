package auth

import (
	"strings"
	"testing"
)

func TestValidAdministratorPassword(t *testing.T) {
	for _, test := range []struct {
		name, password string
		valid          bool
	}{
		{"empty", "", false},
		{"five characters", "Abc12", false},
		{"six characters", "Abc123", true},
		{"nine characters", "Abc123456", true},
		{"maximum length", strings.Repeat("a", 128), true},
		{"too long", strings.Repeat("a", 129), false},
		{"only whitespace", "      ", false},
		{"newline", "Abc123\n", false},
		{"carriage return", "Abc123\r", false},
		{"null byte", "Abc123\x00", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := ValidAdministratorPassword(test.password); got != test.valid {
				t.Fatalf("valid=%v, want %v", got, test.valid)
			}
		})
	}
}
