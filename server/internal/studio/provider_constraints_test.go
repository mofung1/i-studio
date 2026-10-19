package studio

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

func TestOpenAI4KRequestsRespectSizeLimits(t *testing.T) {
	for _, ratio := range []string{"1:1", "2:3", "3:4", "4:3", "9:16", "16:9"} {
		for _, edit := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/edit=%t", ratio, edit), func(t *testing.T) {
				client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
					var size string
					if edit {
						if err := request.ParseMultipartForm(1 << 20); err != nil {
							t.Fatal(err)
						}
						defer request.MultipartForm.RemoveAll()
						size = request.FormValue("size")
					} else {
						var body struct {
							Size string `json:"size"`
						}
						if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
							t.Fatal(err)
						}
						size = body.Size
					}
					var width, height, ratioWidth, ratioHeight int
					if _, err := fmt.Sscanf(size, "%dx%d", &width, &height); err != nil {
						t.Fatalf("invalid size %q: %v", size, err)
					}
					if _, err := fmt.Sscanf(ratio, "%d:%d", &ratioWidth, &ratioHeight); err != nil {
						t.Fatal(err)
					}
					if width <= 0 || height <= 0 || width > 3840 || height > 3840 || width%16 != 0 || height%16 != 0 || width*height < 655360 || width*height > 8294400 {
						t.Fatalf("4K %s request exceeds OpenAI size constraints: %s", ratio, size)
					}
					if width*ratioHeight != height*ratioWidth {
						t.Fatalf("4K request changed aspect ratio %s to %s", ratio, size)
					}
					// Ratios are reduced. The next exact size with both edges on the
					// 16-pixel grid must exceed an edge or pixel limit.
					nextWidth, nextHeight := width+16*ratioWidth, height+16*ratioHeight
					if nextWidth <= 3840 && nextHeight <= 3840 && nextWidth*nextHeight <= 8294400 {
						t.Fatalf("4K %s unnecessarily reduced output size to %s", ratio, size)
					}
					return jsonResponse(request, `{"data":[{"b64_json":"aW1hZ2U="}]}`), nil
				})}
				provider := &imageProtocolTransport{protocol: "openai_images", baseURL: "https://provider.example", client: client}
				input := map[string]any{"model": "gpt-image-2", "prompt": "product photo", "aspectRatio": ratio, "resolution": "4K"}
				if edit {
					input["sourceImages"] = []map[string]string{{"mime": "image/png", "data": base64.StdEncoding.EncodeToString([]byte("source-image"))}}
				}
				if _, err := provider.Submit(context.Background(), input); err != nil {
					t.Fatal(err)
				}
			})
		}
	}
}
