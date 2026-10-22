package studio

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
)

type liveGuardTransport func(*http.Request) (*http.Response, error)

func (f liveGuardTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestLiveAcceptanceGuardRejectsPlaceholderModelBeforeAnyRequest(t *testing.T) {
	var attempts, sent atomic.Int32
	transport := liveCommerceTransport{host: "upstream.example", expectedModel: "gpt-image-2", t: t, posts: &attempts, base: liveGuardTransport(func(*http.Request) (*http.Response, error) {
		sent.Add(1)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{}`))}, nil
	})}
	for _, model := range []string{"custom/future-model", "gpt-image-2"} {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		writer.WriteField("model", model)
		writer.Close()
		r, err := http.NewRequest("POST", "https://upstream.example/v1/images/edits", &body)
		if err != nil {
			t.Fatal(err)
		}
		r.Header.Set("Content-Type", writer.FormDataContentType())
		_, err = transport.RoundTrip(r)
		if model == "custom/future-model" && (err == nil || sent.Load() != 0 || attempts.Load() != 0) {
			t.Fatal("placeholder model could reach live upstream", err)
		}
		if model == "gpt-image-2" && (err != nil || sent.Load() != 1) {
			t.Fatal("authorized model rejected", err)
		}
	}
}
