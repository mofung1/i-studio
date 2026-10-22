package studio

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/istudio/server/internal/domain"
	"github.com/istudio/server/internal/repository"
	objectstore "github.com/istudio/server/internal/storage"
)

// This opt-in acceptance run is never enabled by normal tests. It performs at
// most five paid POSTs, one image for each commerce tool, using public repo
// sample images. Source business configuration is read through a read-only DB
// connection; account, task, asset and ledger writes use isolated test schemas.
func TestLiveCommerceFiveImages(t *testing.T) {
	if os.Getenv("ISTUDIO_LIVE_AUTHORIZATION") != "commerce-five-images-budget-cny-2" {
		t.Skip("explicit live-run authorization not supplied")
	}
	root := os.Getenv("ISTUDIO_LIVE_PROJECT_ROOT")
	output := os.Getenv("ISTUDIO_LIVE_OUTPUT")
	if !filepath.IsAbs(root) || !filepath.IsAbs(output) {
		t.Fatal("absolute project and output paths required")
	}
	s, model, endpointID := operationTestServer(t)
	s.storage = objectstore.NewLocal(s.storageRoot)
	u, err := url.Parse(os.Getenv("ISTUDIO_LIVE_SOURCE_DATABASE_URL"))
	if err != nil || u.Hostname() != "127.0.0.1" {
		t.Fatal("local source database required")
	}
	query := u.Query()
	query.Set("default_transaction_read_only", "on")
	u.RawQuery = query.Encode()
	sourceDB, err := sql.Open("pgx", u.String())
	if err != nil {
		t.Fatal("cannot open source database")
	}
	defer sourceDB.Close()
	sourceModel, err := resolveAvailableModel(sourceDB, "", "")
	if err != nil {
		t.Fatal(err)
	}
	tx, err := sourceDB.BeginTx(context.Background(), &sql.TxOptions{ReadOnly: true})
	if err != nil {
		t.Fatal(err)
	}
	endpoint, err := resolveChannel(tx, sourceModel.ID)
	tx.Rollback()
	if err != nil {
		t.Fatal(err)
	}
	address, err := url.Parse(endpoint.BaseURL)
	if err != nil || address.Hostname() != "api.bananarouter.com" || endpoint.Protocol != "openai_images" || endpoint.Model != "gpt-image-2" {
		t.Fatal("live source differs from the reviewed default channel")
	}
	// Read only the encryption setting, never load or print all environment secrets.
	sourceKey := ""
	envData, _ := os.ReadFile(filepath.Join(root, "server/.env"))
	for _, line := range strings.Split(string(envData), "\n") {
		pair := strings.SplitN(strings.TrimSpace(line), "=", 2)
		if len(pair) == 2 && pair[0] == "AI_CONFIG_ENCRYPTION_KEY" {
			sourceKey = strings.Trim(pair[1], "\"'")
		}
	}
	if sourceKey == "" {
		key, readErr := os.ReadFile(filepath.Join(root, "server/storage/uploads/.ai/encryption.key"))
		if readErr != nil || len(key) != 32 {
			t.Fatal("source encryption key unavailable; no paid calls made")
		}
		sourceKey = base64.StdEncoding.EncodeToString(key)
	}
	t.Setenv("AI_CONFIG_ENCRYPTION_KEY", sourceKey)
	key, err := s.ai.decrypt(endpoint)
	t.Setenv("AI_CONFIG_ENCRYPTION_KEY", "")
	if err != nil {
		t.Fatal("cannot decrypt source endpoint; no paid calls made")
	}
	_, err = s.ai.save(endpointID, endpointInput{Name: "Authorized live acceptance", Purpose: "image", Protocol: endpoint.Protocol, BaseURL: endpoint.BaseURL, APIKey: key, Model: endpoint.Model, TimeoutSeconds: endpoint.TimeoutSeconds, Capabilities: endpoint.Capabilities, Enabled: true})
	if err != nil {
		t.Fatal("cannot prepare isolated live endpoint")
	}
	if _, err = s.db.Exec("UPDATE public_models SET price_minor=$1,name=$2 WHERE id=$3", sourceModel.PriceMinor, sourceModel.Name, model); err != nil {
		t.Fatal(err)
	}
	if _, err = s.db.Exec("UPDATE public_model_channels SET upstream_model_id=$1 WHERE public_model_id=$2 AND is_active", endpoint.Model, model); err != nil {
		t.Fatal(err)
	}
	setPlatformSettings(t, s, `{"maxConcurrentTasks":16}`)
	var posts atomic.Int32
	client := protocolHTTPClient(time.Duration(endpoint.TimeoutSeconds) * time.Second)
	base := client.Transport
	client.Transport = liveCommerceTransport{base: base, posts: &posts, host: address.Hostname(), redactKey: key, t: t, expectedModel: endpoint.Model}
	preflight, err := http.NewRequestWithContext(context.Background(), http.MethodGet, joinProtocolURL(endpoint.BaseURL, "v1/models"), nil)
	if err != nil {
		t.Fatal("cannot build free preflight")
	}
	preflight.Header.Set("Authorization", "Bearer "+key)
	response, err := client.Do(preflight)
	if err != nil {
		t.Fatalf("free provider preflight failed before generation: %s", safeAIError(err, key))
	}
	response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatalf("free provider preflight returned HTTP %d; no generation submitted", response.StatusCode)
	}
	if os.Getenv("ISTUDIO_LIVE_PREFLIGHT_ONLY") == "1" {
		t.Log("free authenticated preflight passed; no generation submitted")
		return
	}
	s.aiHTTPClient = client
	s.provider = &dynamicImageProvider{server: s}
	files := map[string]string{
		"product":   "web/public/images/marketing/ecommerce/skincare-base.webp",
		"reference": "web/public/images/marketing/ecommerce/amber-perfume.webp",
		"garment":   "web/public/images/commerce/clothing.webp",
	}
	for id, filename := range files {
		data, err := os.ReadFile(filepath.Join(root, filename))
		if err != nil {
			t.Fatal(err)
		}
		config, _, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
		if err = s.storage.Save(id+".webp", bytes.NewReader(data)); err != nil {
			t.Fatal(err)
		}
		if _, err = s.db.Exec("INSERT INTO assets(id,user_id,filename,storage_key,mime,size_bytes,width,height) VALUES($1,'member',$1,$2,'image/webp',$3,$4,$5)", id, id+".webp", len(data), config.Width, config.Height); err != nil {
			t.Fatal(err)
		}
	}
	types := []string{"product-main", "detail-page", "viral-recreate", "product-retouch", "clothing-set"}
	jobs := []domain.GenerationTask{}
	for _, kind := range types {
		input := map[string]any{"mode": "commerce", "taskType": kind, "endpointId": model, "model": model, "count": float64(1), "aspectRatio": "3:4", "resolution": "2K", "productAssetIds": []any{"product"}, "platform": "smart", "requirements": "保持参考商品的外形、颜色与包装，不添加虚构文字，只输出一张完整图片。", "outputLanguage": "none"}
		switch kind {
		case "product-main", "detail-page":
			input["moduleMode"] = "smart"
		case "viral-recreate":
			input["referenceAssetIds"] = []any{"reference"}
			input["recreateStrength"] = "style"
		case "product-retouch":
			input["enhancements"] = []any{"clarity", "color", "background"}
		case "clothing-set":
			input["productAssetIds"] = []any{"garment"}
			input["clothingMode"] = "product"
			input["clothingStyle"] = "studio"
			input["moduleCounts"] = map[string]any{"clothing-front": float64(1)}
			input["clothingPlan"] = []clothingShot{{ID: "shot-1", ModuleKey: "clothing-front", Label: "正面精修", Description: "只提取参考图片中的衬衫，输出一张无模特的干净正面商品图，保留颜色、领型和可见纽扣。"}}
		}
		if err = validateGenerationInput(input); err != nil {
			t.Fatal("invalid live scenario before any paid call", kind, err)
		}
		job, _, err := s.reserveGeneration("member", "live-l05-"+kind, sourceModel.PriceMinor, input)
		if err != nil {
			t.Fatal(kind, err)
		}
		var rawSnapshot []byte
		if err = s.db.QueryRow("SELECT provider_snapshot FROM generation_charges WHERE task_id=$1", job.ID).Scan(&rawSnapshot); err != nil {
			t.Fatal(err)
		}
		var frozen frozenProvider
		if err = json.Unmarshal(rawSnapshot, &frozen); err != nil || frozen.UpstreamModelID != endpoint.Model || frozen.Protocol != endpoint.Protocol {
			t.Fatal("isolated channel binding does not match selected live model; no generation submitted")
		}
		jobs = append(jobs, job)
	}
	if err = os.MkdirAll(output, 0700); err != nil {
		t.Fatal(err)
	}
	results := []map[string]any{}
	for i, job := range jobs {
		started := time.Now()
		(&taskQueue{server: s}).processTask(job.ID)
		final, ok, err := repository.TaskByID(s.db, job.ID, "member")
		if err != nil || !ok {
			t.Fatal("cannot inspect live result")
		}
		s.attachBilling(&final)
		result := map[string]any{"tool": types[i], "status": final.Status, "requestedAspectRatio": "3:4", "requestedResolution": "2K", "wallTimeMs": time.Since(started).Milliseconds(), "details": final.ResultDetails, "estimatedCostMicros": 100000, "actualCostMicros": nil, "currency": "CNY", "billing": final.Billing, "errorMessage": final.ErrorMessage}
		if len(final.ResultImages) == 1 {
			var storageKey, mime string
			if err = s.db.QueryRow("SELECT storage_key,mime FROM assets WHERE task_id=$1", job.ID).Scan(&storageKey, &mime); err != nil {
				t.Fatal(err)
			}
			file, err := s.storage.Open(storageKey)
			if err != nil {
				t.Fatal(err)
			}
			data, err := io.ReadAll(file)
			file.Close()
			if err != nil {
				t.Fatal(err)
			}
			filename := types[i] + extensionForMime(mime)
			if err = os.WriteFile(filepath.Join(output, filename), data, 0600); err != nil {
				t.Fatal(err)
			}
			result["outputFile"] = filename
		}
		results = append(results, result)
		summary := map[string]any{"model": sourceModel.Name, "protocol": endpoint.Protocol, "maxPaidPosts": 5, "attemptedGenerationPosts": posts.Load(), "authorizedBudgetCNY": 2, "estimatedTotalCNY": float64(posts.Load()) * 0.1, "actualSupplierTotalCNY": nil, "costBasis": "用户提供约 0.1 CNY/张估算；本轮尚未取得可核对的供应商账单费用", "results": results}
		raw, _ := json.MarshalIndent(summary, "", "  ")
		if err = os.WriteFile(filepath.Join(output, "summary.json"), raw, 0600); err != nil {
			t.Fatal(err)
		}
		t.Logf("%s: %s, saved=%d, elapsed=%ds, paid requests=%d/5", types[i], final.Status, len(final.ResultImages), int(time.Since(started).Seconds()), posts.Load())
		if final.Status != "succeeded" || len(final.ResultImages) != 1 {
			t.Errorf("live %s did not deliver one image: %s", types[i], final.ErrorMessage)
			return
		}
	}
}

type liveCommerceTransport struct {
	base          http.RoundTripper
	posts         *atomic.Int32
	host          string
	redactKey     string
	t             *testing.T
	expectedModel string
}

func (c liveCommerceTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	if r.URL.Hostname() != c.host {
		return nil, fmt.Errorf("live provider host changed")
	}
	if r.Method == http.MethodPost {
		if r.GetBody == nil {
			return nil, fmt.Errorf("cannot verify outgoing model before paid call")
		}
		body, err := r.GetBody()
		if err != nil {
			return nil, err
		}
		defer body.Close()
		media, params, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
		actualModel := ""
		if media == "multipart/form-data" {
			reader := multipart.NewReader(body, params["boundary"])
			for {
				part, e := reader.NextPart()
				if e == io.EOF {
					break
				}
				if e != nil {
					return nil, e
				}
				if part.FormName() == "model" {
					data, _ := io.ReadAll(io.LimitReader(part, 201))
					actualModel = string(data)
				}
				part.Close()
			}
		} else if media == "application/json" {
			var input struct {
				Model string `json:"model"`
			}
			if err = json.NewDecoder(body).Decode(&input); err != nil {
				return nil, err
			}
			actualModel = input.Model
		}
		if actualModel != c.expectedModel {
			return nil, fmt.Errorf("outgoing model differs from authorized live model; no request sent")
		}
	}
	if r.Method == http.MethodPost && c.posts.Add(1) > 5 {
		return nil, fmt.Errorf("authorized five-request cap reached")
	}
	response, err := c.base.RoundTrip(r)
	if err != nil {
		c.t.Logf("provider network error: %s", safeAIError(err, c.redactKey))
		return response, err
	}
	if response.StatusCode >= 400 {
		data, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
		response.Body.Close()
		response.Body = io.NopCloser(bytes.NewReader(data))
		c.t.Logf("provider HTTP %d: %s", response.StatusCode, safeAIError(fmt.Errorf("%s", providerErrorMessage(data)), c.redactKey))
	}
	return response, err
}
