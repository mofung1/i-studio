package studio

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func commerceTestServer(t *testing.T) *Service {
	t.Helper()
	s := testLibraryServer(t)
	data := siteLogoBytes(t, "png")
	for _, item := range []struct{ id, uid string }{{"original", "library-a"}, {"style", "library-a"}, {"foreign", "library-b"}} {
		if err := s.storage.Save(item.id+".png", bytes.NewReader(data)); err != nil {
			t.Fatal(err)
		}
		if _, err := s.db.Exec("INSERT INTO assets(id,user_id,filename,storage_key,mime,size_bytes,width,height) VALUES($1,$2,'product.png',$3,'image/png',$4,16,16)", item.id, item.uid, item.id+".png", len(data)); err != nil {
			t.Fatal(err)
		}
	}
	return s
}

func commerceInputJSON(input commerceProductInput) string {
	raw, _ := json.Marshal(input)
	return string(raw)
}

func commerceDefaultInput() commerceProductInput {
	return commerceProductInput{Name: "玻璃水杯", Description: "透明杯身，蓝色盖子", SellingPoints: "商家确认的便携设计", PreserveDetails: "保留盖子颜色与杯身刻度", ProductAssetIDs: []string{"original"}, ReferenceAssetIDs: []string{"style"}}
}

func createCommerceTestProduct(t *testing.T, s *Service) commerceProduct {
	t.Helper()
	w := libraryHTTP(t, s, http.MethodPost, "/v1/commerce/products", "library-a", commerceInputJSON(commerceDefaultInput()))
	var body struct {
		Product commerceProduct `json:"product"`
	}
	if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &body) != nil || body.Product.ID == "" {
		t.Fatalf("create product: %d %s", w.Code, w.Body.String())
	}
	return body.Product
}

func seedCommerceVersion(t *testing.T, s *Service, productID, assetID, purpose, parent, status string) {
	t.Helper()
	input, _ := json.Marshal(map[string]any{"productId": productID, "productPurpose": purpose, "productVersion": 1, "parentAssetId": parent, "aspectRatio": "3:4", "resolution": "2K", "mode": "general"})
	images, _ := json.Marshal([]string{"/v1/assets/" + assetID + "/content"})
	if _, err := s.db.Exec("INSERT INTO generation_tasks(id,user_id,status,input,result_images) VALUES($1,'library-a',$2,$3::jsonb,$4::jsonb)", "task-"+assetID, status, input, images); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec("INSERT INTO assets(id,user_id,task_id,filename,storage_key,mime,size_bytes,width,height) VALUES($1,'library-a',$2,'result.png',$3,'image/png',100,768,1024)", assetID, "task-"+assetID, assetID+".png"); err != nil {
		t.Fatal(err)
	}
}

func TestCommerceProductInputValidation(t *testing.T) {
	for _, scenario := range []struct {
		name string
		edit func(*commerceProductInput)
	}{
		{"empty name", func(p *commerceProductInput) { p.Name = " " }},
		{"name too long", func(p *commerceProductInput) { p.Name = strings.Repeat("商", 121) }},
		{"description too long", func(p *commerceProductInput) { p.Description = strings.Repeat("商", 2001) }},
		{"selling points too long", func(p *commerceProductInput) { p.SellingPoints = strings.Repeat("商", 2001) }},
		{"preservation too long", func(p *commerceProductInput) { p.PreserveDetails = strings.Repeat("商", 2001) }},
		{"no original", func(p *commerceProductInput) { p.ProductAssetIDs = nil }},
		{"too many references", func(p *commerceProductInput) { p.ReferenceAssetIDs = []string{"1", "2", "3", "4", "5", "6"} }},
		{"duplicate roles", func(p *commerceProductInput) { p.ReferenceAssetIDs = []string{"original"} }},
		{"empty reference", func(p *commerceProductInput) { p.ReferenceAssetIDs = []string{""} }},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			p := commerceDefaultInput()
			scenario.edit(&p)
			if normalizeCommerceProduct(&p, false) == nil {
				t.Fatal("invalid product accepted")
			}
		})
	}
	p := commerceDefaultInput()
	p.Name = ""
	if err := normalizeCommerceProduct(&p, true); err != nil {
		t.Fatal("unsaved product should be analyzable", err)
	}
}

func TestCommerceProductRoutesRequireAuthentication(t *testing.T) {
	router := (&Service{}).router()
	for _, route := range []struct{ method, path string }{
		{"GET", "/v1/commerce/products"}, {"POST", "/v1/commerce/products"},
		{"POST", "/v1/commerce/products/analyze"}, {"GET", "/v1/commerce/products/example"},
		{"PATCH", "/v1/commerce/products/example"}, {"DELETE", "/v1/commerce/products/example"},
		{"GET", "/v1/commerce/products/example/versions"}, {"POST", "/v1/commerce/products/example/adopt"},
	} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(route.method, route.path, strings.NewReader(`{}`)))
		if response.Code != 401 || !strings.Contains(response.Body.String(), "AUTH_REQUIRED") {
			t.Fatalf("%s %s: %d %s", route.method, route.path, response.Code, response.Body.String())
		}
	}
}

func TestCommerceProductCRUDOwnershipAndVersionConflicts(t *testing.T) {
	s := commerceTestServer(t)
	p := createCommerceTestProduct(t, s)
	path := "/v1/commerce/products/" + p.ID
	if p.Version != 1 || p.AdoptedAssetIDs == nil || !reflect.DeepEqual(p.ProductAssetIDs, []string{"original"}) {
		t.Fatal("unexpected initial product", p)
	}
	for _, route := range []string{path, path + "/versions"} {
		if w := libraryHTTP(t, s, "GET", route, "library-b", ""); w.Code != 404 {
			t.Fatal("cross-account read", w.Code)
		}
		if w := libraryHTTP(t, s, "GET", route, "", ""); w.Code != 401 {
			t.Fatal("unauthenticated read", w.Code)
		}
	}
	if w := libraryHTTP(t, s, "GET", "/v1/commerce/products", "library-b", ""); !strings.Contains(w.Body.String(), `"total":0`) {
		t.Fatal("cross-account list", w.Body.String())
	}
	input := p.commerceProductInput
	input.Name = "修改后的商品"
	if w := libraryHTTP(t, s, "PATCH", path, "library-b", commerceInputJSON(input)); w.Code != 404 {
		t.Fatal("cross-account update", w.Code)
	}
	w := libraryHTTP(t, s, "PATCH", path, "library-a", commerceInputJSON(input))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"version":2`) {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := libraryHTTP(t, s, "PATCH", path, "library-a", commerceInputJSON(input)); w.Code != 409 {
		t.Fatal("stale editor overwrote product", w.Code)
	}
	input.Version = 2
	input.ProductAssetIDs = []string{"foreign"}
	if w := libraryHTTP(t, s, "PATCH", path, "library-a", commerceInputJSON(input)); w.Code != 404 {
		t.Fatal("cross-account asset accepted", w.Code)
	}
	w = libraryHTTP(t, s, "GET", path, "library-a", "")
	if !strings.Contains(w.Body.String(), `"version":2`) || !strings.Contains(w.Body.String(), `"productAssetIds":["original"]`) {
		t.Fatal("failed save partially changed product", w.Body.String())
	}
	if w := libraryHTTP(t, s, "DELETE", path, "library-b", ""); w.Code != 404 {
		t.Fatal("cross-account delete", w.Code)
	}
	if w := libraryHTTP(t, s, "DELETE", path, "library-a", ""); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var remaining int
	if err := s.db.QueryRow("SELECT count(*) FROM assets WHERE id IN ('original','style')").Scan(&remaining); err != nil || remaining != 2 {
		t.Fatal("deleting a product removed source assets", remaining, err)
	}
}

func TestCommerceProductReferencesAndProjectsArePrivate(t *testing.T) {
	s := commerceTestServer(t)
	if _, err := s.db.Exec("INSERT INTO projects(id,user_id,name,archived) VALUES('foreign-project','library-b','Other',false),('archived-project','library-a','Old',true),('own-project','library-a','Current',false)"); err != nil {
		t.Fatal(err)
	}
	for _, project := range []string{"foreign-project", "archived-project", "missing"} {
		input := commerceDefaultInput()
		input.ProjectID = project
		w := libraryHTTP(t, s, "POST", "/v1/commerce/products", "library-a", commerceInputJSON(input))
		if w.Code != 404 {
			t.Fatal("invalid project accepted", project, w.Code)
		}
	}
	input := commerceDefaultInput()
	input.ProjectID = "own-project"
	if w := libraryHTTP(t, s, "POST", "/v1/commerce/products", "library-a", commerceInputJSON(input)); w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	if _, err := s.db.Exec("UPDATE assets SET hidden_at=now() WHERE id='style'"); err != nil {
		t.Fatal(err)
	}
	if w := libraryHTTP(t, s, "POST", "/v1/commerce/products", "library-a", commerceInputJSON(input)); w.Code != 404 {
		t.Fatal("hidden style reference accepted", w.Code)
	}
}

func TestCommerceProductVersionsAdoptionAndRollback(t *testing.T) {
	s := commerceTestServer(t)
	p := createCommerceTestProduct(t, s)
	other := createCommerceTestProduct(t, s)
	seedCommerceVersion(t, s, p.ID, "first", "main", "", "succeeded")
	seedCommerceVersion(t, s, p.ID, "edited", "main", "first", "succeeded")
	seedCommerceVersion(t, s, p.ID, "scene", "scene", "", "failed")
	seedCommerceVersion(t, s, p.ID, "pending", "main", "", "processing")
	seedCommerceVersion(t, s, other.ID, "unrelated", "main", "", "succeeded")
	path := "/v1/commerce/products/" + p.ID
	for _, asset := range []string{"foreign", "original", "unrelated", "pending", "missing"} {
		w := libraryHTTP(t, s, "POST", path+"/adopt", "library-a", fmt.Sprintf(`{"assetId":%q}`, asset))
		if w.Code != 404 {
			t.Fatal("non-candidate adopted", asset, w.Code, w.Body.String())
		}
	}
	if w := libraryHTTP(t, s, "POST", path+"/adopt", "library-b", `{"assetId":"first"}`); w.Code != 404 {
		t.Fatal("cross-account adoption", w.Code)
	}
	for _, asset := range []string{"first", "edited", "scene", "first"} {
		w := libraryHTTP(t, s, "POST", path+"/adopt", "library-a", fmt.Sprintf(`{"assetId":%q}`, asset))
		if w.Code != 200 || !strings.Contains(w.Body.String(), `"version":1`) {
			t.Fatal("adoption changed brief version or failed", w.Code, w.Body.String())
		}
	}
	w := libraryHTTP(t, s, "GET", path, "library-a", "")
	if !strings.Contains(w.Body.String(), `"main":"first"`) || !strings.Contains(w.Body.String(), `"scene":"scene"`) {
		t.Fatal("per-purpose adoption or rollback failed", w.Body.String())
	}
	w = libraryHTTP(t, s, "GET", path+"/versions", "library-a", "")
	var result struct {
		Versions []commerceProductVersion `json:"versions"`
		Total    int                      `json:"total"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil || result.Total != 3 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, v := range result.Versions {
		if v.AssetID == "edited" && (v.ParentAssetID != "first" || v.Adopted) {
			t.Fatal("edit history incorrect", v)
		}
		if v.AssetID == "first" && !v.Adopted {
			t.Fatal("rolled-back adoption missing", v)
		}
	}
	if w := libraryHTTP(t, s, "DELETE", path, "library-a", ""); w.Code != 409 {
		t.Fatal("active product removed", w.Code)
	}
	if _, err := s.db.Exec("DELETE FROM assets WHERE id='first'"); err != nil {
		t.Fatal(err)
	}
	w = libraryHTTP(t, s, "GET", path, "library-a", "")
	if strings.Contains(w.Body.String(), `"main":"first"`) {
		t.Fatal("deleted image left dangling adoption", w.Body.String())
	}
}

func TestCommerceProductPagination(t *testing.T) {
	s := commerceTestServer(t)
	for range 3 {
		createCommerceTestProduct(t, s)
	}
	seen := map[string]bool{}
	cursor := ""
	for range 3 {
		w := libraryHTTP(t, s, "GET", "/v1/commerce/products?limit=1&cursor="+cursor, "library-a", "")
		var response struct {
			Products []commerceProduct `json:"products"`
			Next     string            `json:"nextCursor"`
			Total    int               `json:"total"`
		}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &response) != nil || response.Total != 3 || len(response.Products) != 1 || seen[response.Products[0].ID] {
			t.Fatal(w.Code, w.Body.String())
		}
		seen[response.Products[0].ID] = true
		cursor = response.Next
	}
	if cursor != "" || len(seen) != 3 {
		t.Fatal("pagination did not finish", cursor, seen)
	}
}

func TestCommerceProductHydrationUsesTrustedBriefAndIsIdempotent(t *testing.T) {
	s := commerceTestServer(t)
	p := createCommerceTestProduct(t, s)
	input := map[string]any{"productId": p.ID, "productVersion": float64(1), "productPurpose": "scene", "prompt": "放在桌面上", "referenceAssetIds": []any{"foreign"}, "productSnapshot": map[string]any{"name": "forged"}}
	if err := s.hydrateProductGeneration("library-a", input); err != nil {
		t.Fatal(err)
	}
	if input["mode"] != "general" || input["productInstructions"] != "放在桌面上" || !reflect.DeepEqual(input["referenceAssetIds"], []any{"original", "style"}) {
		t.Fatal("untrusted input survived hydration", input)
	}
	prompt := input["prompt"].(string)
	if !strings.Contains(prompt, p.Name) || !strings.Contains(prompt, "图片 2：风格参考") || strings.Contains(prompt, "forged") {
		t.Fatal(prompt)
	}
	first, _ := json.Marshal(input)
	if err := s.hydrateProductGeneration("library-a", input); err != nil {
		t.Fatal(err)
	}
	second, _ := json.Marshal(input)
	if !bytes.Equal(first, second) {
		t.Fatal("hydration repeated or changed the prompt")
	}
	if err := s.hydrateProductGeneration("library-b", input); err == nil {
		t.Fatal("cross-account hydration allowed")
	}
	if _, err := s.db.Exec("UPDATE commerce_products SET version=version+1 WHERE id=$1", p.ID); err != nil {
		t.Fatal(err)
	}
	var operation *operationError
	if err := s.hydrateProductGeneration("library-a", input); !errors.As(err, &operation) || operation.code != "PRODUCT_VERSION_CONFLICT" {
		t.Fatal("stale product silently used current brief", err)
	}
}

func TestCommerceProductEditParentAndTransactionVersionValidation(t *testing.T) {
	s := commerceTestServer(t)
	p := createCommerceTestProduct(t, s)
	other := createCommerceTestProduct(t, s)
	seedCommerceVersion(t, s, p.ID, "parent", "main", "", "succeeded")
	seedCommerceVersion(t, s, other.ID, "other-parent", "main", "", "succeeded")
	input := map[string]any{"productId": p.ID, "productVersion": float64(1), "productPurpose": "main", "parentAssetId": "parent", "productInstructions": "背景改为蓝色", "aspectRatio": "16:9", "resolution": "4K"}
	if err := s.hydrateProductGeneration("library-a", input); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(input["referenceAssetIds"], []any{"parent"}) || input["aspectRatio"] != "3:4" || input["resolution"] != "2K" {
		t.Fatal("edit source or original size lost", input)
	}
	check := func() error {
		tx, err := s.db.Begin()
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback()
		return validateProductOwnershipTx(tx, "library-a", input)
	}
	if err := check(); err != nil {
		t.Fatal(err)
	}
	input["parentAssetId"] = "other-parent"
	if err := check(); err == nil {
		t.Fatal("parent from another product accepted")
	}
	input["parentAssetId"], input["productPurpose"] = "parent", "detail"
	if err := s.hydrateProductGeneration("library-a", input); err == nil {
		t.Fatal("edit changed original purpose")
	}
	input["productPurpose"] = "main"
	if _, err := s.db.Exec("UPDATE commerce_products SET version=2 WHERE id=$1", p.ID); err != nil {
		t.Fatal(err)
	}
	if err := check(); err == nil {
		t.Fatal("brief changed between hydration and reservation")
	}
}

func TestCommerceProductAnalysisIsPrivateAndDoesNotSave(t *testing.T) {
	s := commerceTestServer(t)
	client := &fakePromptClient{model: "test-vision", reply: `{"description":"透明杯身，蓝色盖子","sellingPoints":"便携设计","preserveDetails":"保留杯身刻度"}`}
	s.promptClient = client
	input := commerceDefaultInput()
	input.Name = ""
	w := libraryHTTP(t, s, "POST", "/v1/commerce/products/analyze", "library-a", commerceInputJSON(input))
	if w.Code != 200 || client.images != 1 || !strings.Contains(w.Body.String(), `"analysis"`) || !strings.Contains(w.Body.String(), `"warnings"`) {
		t.Fatal(w.Code, w.Body.String(), client.images)
	}
	var saved int
	if err := s.db.QueryRow("SELECT count(*) FROM commerce_products").Scan(&saved); err != nil || saved != 0 {
		t.Fatal("analysis automatically saved unconfirmed product", saved, err)
	}
	input.ProductAssetIDs = []string{"foreign"}
	client.images = 0
	w = libraryHTTP(t, s, "POST", "/v1/commerce/products/analyze", "library-a", commerceInputJSON(input))
	if w.Code != 404 || client.images != 0 {
		t.Fatal("foreign image sent to upstream", w.Code, client.images)
	}
	input = commerceDefaultInput()
	for _, reply := range []string{`{}`, `{"description":12}`, `not json`, `{"description":"` + strings.Repeat("字", 2001) + `"}`} {
		client.reply = reply
		w = libraryHTTP(t, s, "POST", "/v1/commerce/products/analyze", "library-a", commerceInputJSON(input))
		if w.Code != 502 {
			t.Fatal("invalid AI analysis accepted", w.Code, w.Body.String())
		}
	}
	s.promptClient = nil
	w = libraryHTTP(t, s, "POST", "/v1/commerce/products/analyze", "library-a", commerceInputJSON(input))
	if w.Code != 503 {
		t.Fatal("missing model not communicated", w.Code)
	}
}

func TestCommerceProductReservationRechecksSourceVisibility(t *testing.T) {
	s := commerceTestServer(t)
	p := createCommerceTestProduct(t, s)
	input := map[string]any{"productId": p.ID, "productVersion": float64(1), "productPurpose": "main"}
	if err := s.hydrateProductGeneration("library-a", input); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec("UPDATE assets SET hidden_at=now() WHERE id='original'"); err != nil {
		t.Fatal(err)
	}
	tx, err := s.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	var operation *operationError
	if err := validateProductOwnershipTx(tx, "library-a", input); !errors.As(err, &operation) || operation.code != "PRODUCT_ASSET_NOT_FOUND" {
		t.Fatal("removed original was accepted at reservation", err)
	}
}
