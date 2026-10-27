package app

import (
	"os"
	"strings"
	"testing"
)

func TestAdminCommandPasswordValidation(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	for _, test := range []struct {
		name, password string
		want           int
	}{
		{"five characters", "Abc12", 2},
		{"six characters reaches database check", "Abc123", 1},
		{"nine characters reaches database check", "Abc123456", 1},
		{"maximum length reaches database check", strings.Repeat("a", 128), 1},
		{"too long", strings.Repeat("a", 129), 2},
		{"newline", "Abc123\n", 2},
		{"only whitespace", "      ", 2},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("ADMIN_PASSWORD", test.password)
			if code := runAdminCommand([]string{"--username", "operator"}); code != test.want {
				t.Fatalf("exit=%d, want %d", code, test.want)
			}
		})
	}
}

func TestAdminCommandAcceptsSixCharacterPasswordFromStdin(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("ADMIN_PASSWORD", "bad")
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	if _, err := writer.WriteString("Abc123\r\n"); err != nil {
		writer.Close()
		t.Fatal(err)
	}
	writer.Close()
	previous := os.Stdin
	os.Stdin = reader
	t.Cleanup(func() { os.Stdin = previous })
	if code := runAdminCommand([]string{"--username", "operator", "--password-stdin"}); code != 1 {
		t.Fatalf("exit=%d, want database check after accepting stdin password", code)
	}
}
