package app

import "testing"

func TestCommandsValidateBeforeOpeningServices(t *testing.T) {
	for _, test := range []struct {
		name string
		args []string
		want int
	}{
		{"help", []string{"--help"}, 0},
		{"admin help", []string{"admin", "-h"}, 0},
		{"seed help", []string{"seed-inspiration", "-h"}, 0},
		{"unknown command", []string{"unknown"}, 2},
		{"missing administrator", []string{"admin"}, 2},
		{"invalid administrator", []string{"admin", "--username", "a/b"}, 2},
		{"unknown seed flag", []string{"seed-inspiration", "--unknown"}, 2},
	} {
		t.Run(test.name, func(t *testing.T) {
			if code := Run(test.args); code != test.want {
				t.Fatalf("got %d, want %d", code, test.want)
			}
		})
	}
}
