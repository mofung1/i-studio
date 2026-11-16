package studio

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

// Opt-in capability probe. Reads current business configuration using a
// read-only local connection; never creates accounts, tasks, charges or assets.
// Each phase makes at most one paid request and refuses to overwrite a result.
func TestLiveCommerceCapabilities(t *testing.T) {
	if os.Getenv("ISTUDIO_LIVE_CAPABILITIES_AUTHORIZATION") != "synthetic-vision-composite-mask" {
		t.Skip("live capability probe not authorized")
	}
	root := os.Getenv("ISTUDIO_LIVE_PROJECT_ROOT")
	output := "/private/tmp/istudio-commerce-capabilities"
	phase := os.Getenv("ISTUDIO_LIVE_CAPABILITIES_PHASE")
	if !filepath.IsAbs(root) || !strings.Contains(" metadata vision composite mask ", " "+phase+" ") || phase == "" {
		t.Fatal("absolute root and explicit capability phase required")
	}
	if err := os.MkdirAll(output, 0700); err != nil {
		t.Fatal("cannot prepare output")
	}
	values := map[string]string{}
	data, err := os.ReadFile(filepath.Join(root, "server/.env"))
	if err != nil {
		t.Fatal("local deployment settings unavailable")
	}
	for _, line := range strings.Split(string(data), "\n") {
		pair := strings.SplitN(strings.TrimSpace(line), "=", 2)
		if len(pair) == 2 && (pair[0] == "DATABASE_URL" || pair[0] == "AI_CONFIG_ENCRYPTION_KEY") {
			values[pair[0]] = strings.Trim(pair[1], "\"'")
		}
	}
	u, err := url.Parse(values["DATABASE_URL"])
	if err != nil || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost") || u.Query().Get("host") != "" || u.Query().Get("hostaddr") != "" {
		t.Fatal("strictly local source database required")
	}
	query := u.Query()
	query.Set("default_transaction_read_only", "on")
	u.RawQuery = query.Encode()
	db, err := sql.Open("pgx", u.String())
	if err != nil {
		t.Fatal("cannot open read-only source database")
	}
	defer db.Close()
	s := &Service{db: db, storageRoot: filepath.Join(root, "server/storage/uploads")}
	s.ai = newAIConfigStore(s)
	promptEndpoint, err := s.ai.resolve("prompt", "", "")
	if err != nil {
		t.Fatal("no usable configured prompt endpoint")
	}
	model, err := resolveAvailableModel(db, "", "")
	if err != nil {
		t.Fatal("no available default public image model")
	}
	tx, err := db.BeginTx(context.Background(), &sql.TxOptions{ReadOnly: true})
	if err != nil {
		t.Fatal("cannot start read-only channel lookup")
	}
	imageEndpoint, err := resolveChannel(tx, model.ID)
	_ = tx.Rollback()
	if err != nil {
		t.Fatal("no active image channel")
	}
	metadata := map[string]any{"prompt": capabilityEndpointMetadata(promptEndpoint), "image": capabilityEndpointMetadata(imageEndpoint), "publicModel": model.Name, "publicCapabilities": model.Capabilities, "readOnlySource": true, "fixtures": "programmatically generated geometry only", "cost": "provider billing not supplied"}
	capabilityWriteJSON(t, filepath.Join(output, "metadata.json"), metadata)
	if phase == "metadata" {
		encoded, _ := json.Marshal(metadata)
		t.Log(string(encoded))
		return
	}
	resultPath := filepath.Join(output, phase+".json")
	if _, err := os.Stat(resultPath); err == nil {
		t.Fatal("existing result blocks duplicate paid capability request")
	}
	// A persisted attempt marker also blocks retries following timeout/crash.
	marker, err := os.OpenFile(filepath.Join(output, phase+".attempt"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		t.Fatal("attempt already exists; inspect before any deliberate retry")
	}
	_ = marker.Close()
	if values["AI_CONFIG_ENCRYPTION_KEY"] == "" {
		key, err := os.ReadFile(filepath.Join(s.storageRoot, ".ai/encryption.key"))
		if err != nil || len(key) != 32 {
			t.Fatal("source encryption key unavailable")
		}
		values["AI_CONFIG_ENCRYPTION_KEY"] = base64.StdEncoding.EncodeToString(key)
	}
	t.Setenv("AI_CONFIG_ENCRYPTION_KEY", values["AI_CONFIG_ENCRYPTION_KEY"])
	endpoint := imageEndpoint
	if phase == "vision" {
		endpoint = promptEndpoint
	}
	key, err := s.ai.decrypt(endpoint)
	if err != nil {
		t.Fatal("cannot decrypt selected endpoint")
	}
	address, err := url.Parse(endpoint.BaseURL)
	if err != nil || address.Scheme != "https" || address.User != nil || address.RawQuery != "" {
		t.Fatal("selected endpoint must be plain HTTPS")
	}
	client := protocolHTTPClient(300 * time.Second)
	guard := &capabilityTransport{base: client.Transport, host: address.Host, phase: phase}
	client.Transport = guard
	a, b, base, mask, labels := capabilityFixtures(t, output)
	start := time.Now()
	result := map[string]any{"phase": phase, "endpoint": capabilityEndpointMetadata(endpoint), "expectedLabels": labels, "requestCount": 1, "visualReviewRequired": phase != "vision"}
	defer func() {
		result["elapsedMs"] = time.Since(start).Milliseconds()
		result["httpStatus"] = guard.status
		capabilityWriteJSON(t, resultPath, result)
	}()
	if phase == "vision" {
		c := newOpenAICompatibleClient(endpoint, key)
		c.client = client
		response, err := c.complete(context.Background(), "Inspect the supplied image and reply with JSON only. Do not infer labels from the prompt.", `Read this image. Return {"label":"exact uppercase label printed at bottom","shape":"main colored shape","color":"main shape color","blackDots":number of small black dots}.`, []promptImage{{Mime: "image/png", Data: base64.StdEncoding.EncodeToString(a), Detail: "high"}}, 300)
		if err != nil {
			result["error"] = "vision request failed"
			t.Error("vision request failed; no raw provider content logged")
			return
		}
		result["response"] = response
		var observed struct {
			Label, Shape, Color string
			BlackDots           int `json:"blackDots"`
		}
		parseErr := json.Unmarshal([]byte(sanitizeModelText(response)), &observed)
		passed := parseErr == nil && strings.EqualFold(observed.Label, labels[0]) && strings.Contains(strings.ToLower(observed.Shape), "triangle") && strings.Contains(strings.ToLower(observed.Color), "red") && observed.BlackDots == 3
		result["contentPassed"] = passed
		if !passed {
			t.Error("vision content did not match generated ground truth")
		}
		t.Logf("vision contentPassed=%v", passed)
		return
	}
	if endpoint.Protocol != "openai_images" {
		result["error"] = "active image protocol is not OpenAI Images"
		t.Error("active image protocol is not OpenAI Images")
		return
	}
	var request bytes.Buffer
	writer := multipart.NewWriter(&request)
	images := [][]byte{a, b}
	prompt := "Create one square white image by combining both supplied source images. Put the red triangle and its exact black label from image 1 on the LEFT half, and the blue ring and its exact black label from image 2 on the RIGHT half. Preserve both labels exactly, preserve the three small black dots from image 1 and the two small black dots from image 2 near their own shapes. Use clean flat geometry, white background, no decorative elements. Both sources must be visibly represented."
	if phase == "mask" {
		images = [][]byte{base}
		prompt = "Change the red square in the LEFT half to a bright green square, keeping its exact size and position. Preserve the blue ring on the right, both black labels, the small black dots, the pure white background and every unmasked pixel. Only edit inside the supplied transparent mask region."
	}
	for i, image := range images {
		capabilityFile(t, writer, "image[]", fmt.Sprintf("source-%d.png", i+1), image)
	}
	if phase == "mask" {
		capabilityFile(t, writer, "mask", "mask.png", mask)
	}
	for name, value := range map[string]string{"model": endpoint.Model, "prompt": prompt, "n": "1", "size": "1024x1024"} {
		if err := writer.WriteField(name, value); err != nil {
			t.Fatal("cannot build request")
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal("cannot close request")
	}
	req, err := http.NewRequestWithContext(context.Background(), "POST", joinProtocolURL(endpoint.BaseURL, "/v1/images/edits"), &request)
	if err != nil {
		t.Fatal("cannot construct image request")
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	transport := &imageProtocolTransport{baseURL: endpoint.BaseURL, apiKey: key, client: client, protocol: endpoint.Protocol, model: endpoint.Model}
	generated, err := transport.sendProviderRequest(req, map[string]any{"taskId": "capability-" + phase + "-" + labels[0]}, false)
	if err != nil {
		result["error"] = "image edit request failed or returned unsupported response"
		t.Error("image edit request failed; no raw provider content logged")
		return
	}
	if len(generated.Images) != 1 {
		t.Error("expected exactly one generated image")
		return
	}
	imageData := capabilityReadImage(t, generated.Images[0])
	decoded, _, err := image.Decode(bytes.NewReader(imageData))
	if err != nil {
		t.Fatal("generated image cannot be decoded")
	}
	result["width"], result["height"] = decoded.Bounds().Dx(), decoded.Bounds().Dy()
	imagePath := filepath.Join(output, phase+"-result.png")
	file, err := os.OpenFile(imagePath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		t.Fatal("cannot save result image")
	}
	err = png.Encode(file, decoded)
	_ = file.Close()
	if err != nil {
		t.Fatal("cannot encode result")
	}
	result["imagePath"] = imagePath
	result["metrics"] = capabilityMetrics(decoded, base, phase)
	result["apiAccepted"] = true
	t.Logf("%s API accepted; output %dx%d; visual review still required", phase, decoded.Bounds().Dx(), decoded.Bounds().Dy())
}

func capabilityEndpointMetadata(e endpointConfig) map[string]any {
	u, _ := url.Parse(e.BaseURL)
	host := "invalid"
	if u != nil {
		host = u.Hostname()
	}
	return map[string]any{"host": host, "model": e.Model, "protocol": e.Protocol, "visionConfigured": e.Capabilities["vision"], "timeoutSeconds": e.TimeoutSeconds}
}

type capabilityTransport struct {
	base          http.RoundTripper
	host, phase   string
	calls, status int
}

func (c *capabilityTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	expected := "/images/edits"
	if c.phase == "vision" {
		expected = "/chat/completions"
	}
	if r.Method != "POST" || r.URL.Scheme != "https" || r.URL.Host != c.host || !strings.HasSuffix(r.URL.Path, expected) || c.calls != 0 {
		return nil, fmt.Errorf("capability transport blocked unrelated or duplicate request")
	}
	c.calls++
	base := c.base
	if base == nil {
		base = http.DefaultTransport
	}
	response, err := base.RoundTrip(r)
	if response != nil {
		c.status = response.StatusCode
	}
	if err != nil {
		return nil, fmt.Errorf("capability transport failed")
	}
	return response, nil
}

func capabilityWriteJSON(t *testing.T, path string, value any) {
	t.Helper()
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil || os.WriteFile(path, raw, 0600) != nil {
		t.Fatal("cannot write sanitized report")
	}
}
func capabilityFile(t *testing.T, w *multipart.Writer, field, name string, data []byte) {
	t.Helper()
	headers := make(textproto.MIMEHeader)
	headers.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, field, name))
	headers.Set("Content-Type", "image/png")
	part, err := w.CreatePart(headers)
	if err != nil {
		t.Fatal("cannot create PNG part")
	}
	if _, err = part.Write(data); err != nil {
		t.Fatal("cannot write PNG part")
	}
}
func capabilityReadImage(t *testing.T, source string) []byte {
	t.Helper()
	if strings.HasPrefix(source, "data:") {
		_, encoded, ok := strings.Cut(source, ";base64,")
		if !ok {
			t.Fatal("invalid inline image")
		}
		data, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			t.Fatal("invalid image encoding")
		}
		return data
	}
	u, err := url.Parse(source)
	if err != nil || u.Scheme != "https" || u.User != nil {
		t.Fatal("unsafe result URL")
	}
	client := protocolHTTPClient(60 * time.Second)
	response, err := client.Get(source)
	if err != nil {
		t.Fatal("cannot retrieve generated image")
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatal("generated image download failed")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 32<<20))
	if err != nil {
		t.Fatal("cannot read generated image")
	}
	return data
}

func capabilityFixtures(t *testing.T, output string) ([]byte, []byte, []byte, []byte, []string) {
	t.Helper()
	labelPath := filepath.Join(output, "fixture-labels.json")
	labels := []string{}
	if raw, err := os.ReadFile(labelPath); err == nil {
		_ = json.Unmarshal(raw, &labels)
	}
	if len(labels) != 2 {
		raw := make([]byte, 6)
		if _, err := rand.Read(raw); err != nil {
			t.Fatal("cannot create random fixture labels")
		}
		labels = []string{strings.ToUpper(hex.EncodeToString(raw[:3])), strings.ToUpper(hex.EncodeToString(raw[3:]))}
		capabilityWriteJSON(t, labelPath, labels)
	}
	white := color.RGBA{255, 255, 255, 255}
	red := color.RGBA{230, 30, 30, 255}
	blue := color.RGBA{30, 70, 230, 255}
	black := color.RGBA{0, 0, 0, 255}
	canvas := func() *image.RGBA {
		im := image.NewRGBA(image.Rect(0, 0, 1024, 1024))
		draw.Draw(im, im.Bounds(), &image.Uniform{white}, image.Point{}, draw.Src)
		return im
	}
	circle := func(im *image.RGBA, cx, cy, r int, c color.RGBA) {
		for y := cy - r; y <= cy+r; y++ {
			for x := cx - r; x <= cx+r; x++ {
				if (x-cx)*(x-cx)+(y-cy)*(y-cy) <= r*r {
					im.SetRGBA(x, y, c)
				}
			}
		}
	}
	label := func(im *image.RGBA, text string, x, y, scale int) {
		small := image.NewRGBA(image.Rect(0, 0, len(text)*7, 13))
		d := font.Drawer{Dst: small, Src: &image.Uniform{black}, Face: basicfont.Face7x13, Dot: fixed.P(0, 11)}
		d.DrawString(text)
		for sy := 0; sy < 13; sy++ {
			for sx := 0; sx < len(text)*7; sx++ {
				_, _, _, a := small.At(sx, sy).RGBA()
				if a > 0 {
					draw.Draw(im, image.Rect(x+sx*scale, y+sy*scale, x+(sx+1)*scale, y+(sy+1)*scale), &image.Uniform{black}, image.Point{}, draw.Src)
				}
			}
		}
	}
	a, b, base := canvas(), canvas(), canvas()
	for y := 200; y < 650; y++ {
		half := (y - 200) * 300 / 450
		draw.Draw(a, image.Rect(512-half, y, 513+half, y+1), &image.Uniform{red}, image.Point{}, draw.Src)
	}
	circle(b, 512, 425, 230, blue)
	circle(b, 512, 425, 125, white)
	for i := 0; i < 3; i++ {
		circle(a, 400+i*110, 740, 22, black)
	}
	for i := 0; i < 2; i++ {
		circle(b, 455+i*110, 740, 22, black)
	}
	label(a, labels[0], 344, 830, 8)
	label(b, labels[1], 344, 830, 8)
	draw.Draw(base, image.Rect(110, 300, 400, 590), &image.Uniform{red}, image.Point{}, draw.Src)
	circle(base, 765, 445, 165, blue)
	circle(base, 765, 445, 85, white)
	for i := 0; i < 3; i++ {
		circle(base, 180+i*70, 690, 15, black)
	}
	for i := 0; i < 2; i++ {
		circle(base, 730+i*70, 690, 15, black)
	}
	label(base, labels[0], 130, 790, 6)
	label(base, labels[1], 640, 790, 6)
	mask := canvas()
	draw.Draw(mask, image.Rect(75, 265, 435, 625), &image.Uniform{color.RGBA{}}, image.Point{}, draw.Src)
	encoded := [][]byte{}
	for i, im := range []*image.RGBA{a, b, base, mask} {
		var buffer bytes.Buffer
		if png.Encode(&buffer, im) != nil {
			t.Fatal("cannot generate synthetic fixture")
		}
		encoded = append(encoded, buffer.Bytes())
		if os.WriteFile(filepath.Join(output, []string{"source-a.png", "source-b.png", "edit-base.png", "edit-mask.png"}[i]), buffer.Bytes(), 0600) != nil {
			t.Fatal("cannot save synthetic fixture")
		}
	}
	return encoded[0], encoded[1], encoded[2], encoded[3], labels
}

func capabilityMetrics(result image.Image, baseData []byte, phase string) map[string]any {
	metrics := map[string]any{}
	bounds := result.Bounds()
	counts := map[string]int{"redLeft": 0, "greenLeft": 0, "blueRight": 0}
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, _ := result.At(x, y).RGBA()
			left := x-bounds.Min.X < bounds.Dx()/2
			if left && r > 35000 && r > g*2 && r > b*2 {
				counts["redLeft"]++
			}
			if left && g > 25000 && g > r*2 && g > b*2 {
				counts["greenLeft"]++
			}
			if !left && b > 30000 && b > r*2 && b > g*2 {
				counts["blueRight"]++
			}
		}
	}
	metrics["colorPixelCounts"] = counts
	if phase == "mask" && bounds.Dx() == 1024 && bounds.Dy() == 1024 {
		base, _, err := image.Decode(bytes.NewReader(baseData))
		if err == nil {
			var diff float64
			changed, total := 0, 0
			for y := 0; y < 1024; y++ {
				for x := 0; x < 1024; x++ {
					if x >= 75 && x < 435 && y >= 265 && y < 625 {
						continue
					}
					ar, ag, ab, _ := result.At(x, y).RGBA()
					br, bg, bb, _ := base.At(x, y).RGBA()
					delta := capabilityAbs(int(ar)-int(br)) + capabilityAbs(int(ag)-int(bg)) + capabilityAbs(int(ab)-int(bb))
					diff += float64(delta) / 257
					total++
					if delta > 30*257 {
						changed++
					}
				}
			}
			metrics["outsideMaskMeanChannelDifference255"] = diff / float64(total*3)
			metrics["outsideMaskChangedPixelRatio"] = float64(changed) / float64(total)
		}
	}
	return metrics
}
func capabilityAbs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
