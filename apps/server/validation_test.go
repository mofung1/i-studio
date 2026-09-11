package main

import "testing"

func TestValidateGenerationInput(t *testing.T) {
	tests := []struct {
		name    string
		input   map[string]any
		wantErr bool
	}{
		{
			name:  "general defaults",
			input: map[string]any{"mode": "general", "prompt": "minimal product photo"},
		},
		{
			name: "valid commerce",
			input: map[string]any{
				"mode": "commerce", "taskType": "scene", "productAssetIds": []any{"asset-1"},
				"productName": "Headphones", "productCategory": "Electronics", "sceneDescription": "On a clean desk",
			},
		},
		{
			name:    "missing product asset",
			input:   map[string]any{"mode": "commerce", "taskType": "white-background", "productAssetIds": []any{}, "productName": "Cup", "productCategory": "Home"},
			wantErr: true,
		},
		{
			name:    "fractional count",
			input:   map[string]any{"mode": "general", "prompt": "photo", "count": 1.5},
			wantErr: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateGenerationInput(test.input)
			if (err != nil) != test.wantErr {
				t.Fatalf("validateGenerationInput() error = %v, wantErr %v", err, test.wantErr)
			}
		})
	}
}

func TestValidUsername(t *testing.T) {
	if !validUsername("demo_user1") {
		t.Fatal("expected username to be valid")
	}
	for _, value := range []string{"ab", "user-name", "用户", "name with spaces"} {
		if validUsername(value) {
			t.Fatalf("expected %q to be invalid", value)
		}
	}
}
