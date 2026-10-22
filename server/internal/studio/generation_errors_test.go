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

func TestUnavailableUpstreamModelGetsActionablePrivateSafeMessage(t *testing.T) {
	message := publicGenerationError("AI endpoint 404: Model unavailable. secret-provider-model https://provider.example?key=secret")
	if !strings.Contains(message, "当前通道暂不可用") || strings.Contains(message, "secret") || publicGenerationError(message) != message {
		t.Fatal(message)
	}
}
