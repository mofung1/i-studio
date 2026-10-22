package studio

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestModelUsageHintLifecycle(t *testing.T) {
	s, id, _ := operationTestServer(t)
	m := readAdminModel(t, s, id)
	if m.UsageHint != "" {
		t.Fatal("existing models must start without a suggestion")
	}
	m.UsageHint = "  适合已实测的商品场景创作  "
	if w := saveAdminModel(s, m); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	m = readAdminModel(t, s, id)
	if m.UsageHint != "适合已实测的商品场景创作" {
		t.Fatal("suggestion was not trimmed and persisted", m.UsageHint)
	}
	public := func() []publicModel {
		t.Helper()
		w := httptest.NewRecorder()
		s.capabilities(w, httptest.NewRequest(http.MethodGet, "/v1/generation/capabilities", nil))
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
		var body struct {
			Models []publicModel `json:"imageEndpoints"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		return body.Models
	}
	models := public()
	if len(models) != 1 || models[0].UsageHint != m.UsageHint {
		t.Fatal("public suggestion missing", models)
	}
	m.Name = "以后替换的模型名称"
	m.UsageHint = "新的实测建议"
	if w := saveAdminModel(s, m); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	models = public()
	if len(models) != 1 || models[0].Name != m.Name || models[0].UsageHint != m.UsageHint {
		t.Fatal("public metadata did not update", models)
	}
	m = readAdminModel(t, s, id)
	m.Enabled, m.IsDefault = false, false
	if w := saveAdminModel(s, m); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if len(public()) != 0 {
		t.Fatal("off-sale model still advertised")
	}
	m = readAdminModel(t, s, id)
	m.UsageHint, m.Enabled = "", true
	if w := saveAdminModel(s, m); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	models = public()
	if len(models) != 1 || models[0].UsageHint != "" {
		t.Fatal("optional suggestion cannot be cleared", models)
	}
	created := readAdminModel(t, s, id)
	created.ID, created.Name, created.UsageHint = "", "新增模型", "新增模型的实测建议"
	created.IsDefault = false
	w := saveAdminModel(s, created)
	if w.Code != 200 {
		t.Fatal("create with suggestion failed", w.Code, w.Body.String())
	}
	var saved struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &saved); err != nil {
		t.Fatal(err)
	}
	if readAdminModel(t, s, saved.ID).UsageHint != created.UsageHint {
		t.Fatal("new model suggestion was not persisted")
	}
}

func TestModelUsageHintLimitDoesNotModifyStoredModel(t *testing.T) {
	s, id, _ := operationTestServer(t)
	m := readAdminModel(t, s, id)
	m.UsageHint = strings.Repeat("字", 200)
	if w := saveAdminModel(s, m); w.Code != 200 {
		t.Fatal("valid Chinese limit rejected", w.Body.String())
	}
	m = readAdminModel(t, s, id)
	version := m.Version
	m.UsageHint += "字"
	if w := saveAdminModel(s, m); w.Code != 400 {
		t.Fatal("overlong suggestion accepted", w.Code)
	}
	stored := readAdminModel(t, s, id)
	if stored.Version != version || stored.UsageHint != strings.Repeat("字", 200) {
		t.Fatal("invalid input changed stored model")
	}
}
