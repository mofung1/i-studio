package studio

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/istudio/server/internal/domain"
	objectstore "github.com/istudio/server/internal/storage"
)

func productMaskFixture(t *testing.T) (*Service, string, map[string]any, []byte, []byte) {
	t.Helper()
	s, model, _ := operationTestServer(t)
	s.storage = objectstore.NewLocal(s.storageRoot)
	s.testToken(domain.User{ID: "other-mask-user"})
	if _, err := s.db.Exec(`UPDATE public_models SET capabilities=jsonb_set(capabilities,'{maskEditing}','true'::jsonb) WHERE id=$1`, model); err != nil {
		t.Fatal(err)
	}
	base := maskTestPNG(t, 2, 1, maskSolid(color.NRGBA{R: 230, G: 20, B: 30, A: 255}))
	mask := maskTestPNG(t, 2, 1, func(x, y int) color.NRGBA {
		if x == 0 {
			return color.NRGBA{}
		}
		return color.NRGBA{A: 255}
	})
	opaque := maskTestPNG(t, 2, 1, maskSolid(color.NRGBA{A: 255}))
	wrongSize := maskTestPNG(t, 1, 1, maskSolid(color.NRGBA{}))
	for _, asset := range []struct {
		id, owner string
		data      []byte
	}{
		{"mask-parent", "member", base}, {"mask-good", "member", mask}, {"mask-opaque", "member", opaque}, {"mask-dimensions", "member", wrongSize},
		{"mask-foreign", "other-mask-user", mask}, {"parent-foreign", "other-mask-user", base},
	} {
		key := asset.id + ".png"
		if err := s.storage.Save(key, bytes.NewReader(asset.data)); err != nil {
			t.Fatal(err)
		}
		config, _, err := image.DecodeConfig(bytes.NewReader(asset.data))
		if err != nil {
			t.Fatal(err)
		}
		if _, err = s.db.Exec(`INSERT INTO assets(id,user_id,filename,storage_key,mime,size_bytes,width,height) VALUES($1,$2,$3,$3,'image/png',$4,$5,$6)`, asset.id, asset.owner, key, len(asset.data), config.Width, config.Height); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.db.Exec(`INSERT INTO commerce_products(id,user_id,name,product_asset_ids) VALUES('mask-product','member','synthetic product','["mask-parent"]'::jsonb)`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`INSERT INTO generation_tasks(id,user_id,status,input,result_images) VALUES('mask-origin-task','member','succeeded','{"productId":"mask-product","productPurpose":"main","productVersion":1,"aspectRatio":"1:1","resolution":"2K"}'::jsonb,'["/v1/assets/mask-parent/content"]'::jsonb)`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`UPDATE assets SET task_id='mask-origin-task' WHERE id='mask-parent'`); err != nil {
		t.Fatal(err)
	}
	input := operationInput(model, 1)
	input["productId"], input["productVersion"], input["productPurpose"] = "mask-product", float64(1), "main"
	input["parentAssetId"], input["maskAssetId"], input["productInstructions"] = "mask-parent", "mask-good", "change selected region to blue"
	return s, model, input, base, mask
}

func submitProductMask(t *testing.T, s *Service, input map[string]any, key string) *httptest.ResponseRecorder {
	t.Helper()
	encoded, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("POST", "/v1/generation/tasks", bytes.NewReader(encoded))
	req.Header.Set("Authorization", "Bearer "+s.testToken(domain.User{ID: "member"}))
	req.Header.Set("Idempotency-Key", key)
	req.Header.Set("X-Expected-Unit-Price", "125")
	w := httptest.NewRecorder()
	s.tasksHandler(w, req)
	return w
}

func TestProductMaskInvalidAndForeignInputsFailBeforeCharges(t *testing.T) {
	for _, name := range []string{"opaque selection", "wrong dimensions", "foreign mask", "foreign parent", "unsupported model"} {
		t.Run(name, func(t *testing.T) {
			s, model, input, _, _ := productMaskFixture(t)
			s.provider = &deliveryTestProvider{submit: func(context.Context, map[string]any) (providerTask, error) {
				t.Error("invalid input reached provider")
				return providerTask{}, fmt.Errorf("unexpected submission")
			}}
			switch name {
			case "opaque selection":
				input["maskAssetId"] = "mask-opaque"
			case "wrong dimensions":
				input["maskAssetId"] = "mask-dimensions"
			case "foreign mask":
				input["maskAssetId"] = "mask-foreign"
			case "foreign parent":
				input["parentAssetId"] = "parent-foreign"
			case "unsupported model":
				if _, err := s.db.Exec(`UPDATE public_models SET capabilities=capabilities-'maskEditing' WHERE id=$1`, model); err != nil {
					t.Fatal(err)
				}
			}
			var initialLedger int
			if err := s.db.QueryRow("SELECT count(*) FROM credit_ledger WHERE user_id='member'").Scan(&initialLedger); err != nil {
				t.Fatal(err)
			}
			response := submitProductMask(t, s, input, "mask-rejection-"+name)
			if response.Code < 400 || response.Code >= 500 {
				t.Fatalf("bad mask should fail as user input: %d %s", response.Code, response.Body.String())
			}
			var available, held int64
			var charges, ledger int
			if err := s.db.QueryRow("SELECT available,held FROM credit_accounts WHERE user_id='member'").Scan(&available, &held); err != nil {
				t.Fatal(err)
			}
			if err := s.db.QueryRow("SELECT count(*) FROM generation_charges WHERE user_id='member'").Scan(&charges); err != nil {
				t.Fatal(err)
			}
			if err := s.db.QueryRow("SELECT count(*) FROM credit_ledger WHERE user_id='member'").Scan(&ledger); err != nil {
				t.Fatal(err)
			}
			if available != 10000 || held != 0 || charges != 0 || ledger != initialLedger {
				t.Fatalf("invalid mask changed billing: available=%d held=%d charges=%d ledger=%d/%d", available, held, charges, ledger, initialLedger)
			}
		})
	}
}

func TestProductMaskRecoveryUsesTrustedMaskAndSettlesExactlyOnce(t *testing.T) {
	for _, wrongRatio := range []bool{false, true} {
		t.Run(fmt.Sprintf("wrongRatio=%v", wrongRatio), func(t *testing.T) {
			s, _, input, base, realMask := productMaskFixture(t)
			q := &taskQueue{server: s, fallback: make(chan string, 2)}
			s.queue = q
			calls := 0
			s.provider = &deliveryTestProvider{submit: func(context.Context, map[string]any) (providerTask, error) {
				calls++
				return providerTask{}, fmt.Errorf("recovery must not generate again")
			}}
			input["sourceMask"] = map[string]string{"mime": "image/png", "data": "injected-mask"}
			input["sourceImages"] = []map[string]string{{"mime": "image/png", "data": "injected-image"}}
			input["productSnapshot"] = map[string]any{"name": "injected product"}
			response := submitProductMask(t, s, input, "mask-valid-recovery")
			if response.Code != 202 {
				t.Fatalf("valid mask was rejected: %d %s", response.Code, response.Body.String())
			}
			var payload struct {
				Task domain.GenerationTask `json:"task"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatal(err)
			}
			job := payload.Task
			var raw []byte
			if err := s.db.QueryRow("SELECT input FROM generation_tasks WHERE id=$1", job.ID).Scan(&raw); err != nil {
				t.Fatal(err)
			}
			if bytes.Contains(raw, []byte("injected")) || bytes.Contains(raw, []byte("sourceMask")) || bytes.Contains(raw, []byte("sourceImages")) {
				t.Fatal("client-injected trusted fields persisted")
			}
			var trusted map[string]any
			if err := json.Unmarshal(raw, &trusted); err != nil {
				t.Fatal(err)
			}
			if err := s.attachSourceImages(trusted); err != nil {
				t.Fatal(err)
			}
			attached, ok := trusted["sourceMask"].(map[string]string)
			if !ok {
				t.Fatal("worker did not load mask")
			}
			decoded, err := base64.StdEncoding.DecodeString(attached["data"])
			if err != nil || !bytes.Equal(decoded, realMask) {
				t.Fatal("worker did not load owned mask bytes")
			}
			sources := sourceImages(trusted)
			if len(sources) != 1 {
				t.Fatalf("edit must use original result as sole image: %d", len(sources))
			}
			decoded, err = base64.StdEncoding.DecodeString(sources[0]["data"])
			if err != nil || !bytes.Equal(decoded, base) {
				t.Fatal("worker did not use original parent image")
			}
			width, height := 2, 1
			if wrongRatio {
				width, height = 3, 2
			}
			generated := maskTestPNG(t, width, height, maskSolid(color.NRGBA{B: 255, A: 255}))
			old := claimDeliveryRun(t, s, job.ID)
			if _, _, err := old.begin(context.Background(), 1, job.ID+"-1", ""); err != nil {
				t.Fatal(err)
			}
			if _, err := old.keepSource(context.Background(), 1, "test-provider-result", "data:image/png;base64,"+base64.StdEncoding.EncodeToString(generated)); err != nil {
				t.Fatal(err)
			}
			expireDeliveryRun(t, s, job.ID)
			q.processTask(job.ID)
			q.processTask(job.ID)
			if calls != 0 {
				t.Fatal("recovery submitted a duplicate paid request")
			}
			if wrongRatio {
				assertDeliverySettlement(t, s, job.ID, "failed", 0, 1)
				return
			}
			final := assertDeliverySettlement(t, s, job.ID, "succeeded", 1, 1)
			var key, mime string
			var size int64
			id := strings.TrimSuffix(strings.TrimPrefix(final.ResultImages[0], "/v1/assets/"), "/content")
			if err := s.db.QueryRow("SELECT storage_key,mime,size_bytes FROM assets WHERE id=$1", id).Scan(&key, &mime, &size); err != nil {
				t.Fatal(err)
			}
			file, err := s.storage.Open(key)
			if err != nil {
				t.Fatal(err)
			}
			saved, err := io.ReadAll(file)
			file.Close()
			if err != nil {
				t.Fatal(err)
			}
			if mime != "image/png" || size != int64(len(saved)) {
				t.Fatal("final composed asset MIME/size is not used for accounting")
			}
			im, _, err := image.Decode(bytes.NewReader(saved))
			if err != nil {
				t.Fatal(err)
			}
			if got := color.NRGBAModel.Convert(im.At(0, 0)).(color.NRGBA); got != (color.NRGBA{B: 255, A: 255}) {
				t.Fatal("selected region not generated", got)
			}
			if got := color.NRGBAModel.Convert(im.At(1, 0)).(color.NRGBA); got != (color.NRGBA{R: 230, G: 20, B: 30, A: 255}) {
				t.Fatal("unselected region did not retain exact original pixels", got)
			}
		})
	}
}
