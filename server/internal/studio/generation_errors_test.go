package studio

import (
	"errors"
	"strings"
	"testing"
)

func TestGenerationFailureDiagnosticsDoNotEchoProviderData(t *testing.T) {
	private := "https://private-provider.example/image?api_key=fixture-secret&signature=private-signature"
	for _, message := range []string{
		"download generated image 1 failed: remote image response invalid " + private,
		"第 1 批提交失败：AI endpoint 502: " + private,
		"unexpected provider response " + private,
	} {
		diagnostic := generationFailureReason(errors.New(message))
		if diagnostic == "" {
			t.Fatal("missing diagnostic label")
		}
		for _, secret := range []string{"private-provider", "fixture-secret", "private-signature", "https://"} {
			if strings.Contains(diagnostic, secret) {
				t.Fatal("provider data exposed in diagnostic label")
			}
		}
	}
}
