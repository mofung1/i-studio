package studio

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	objectstore "github.com/istudio/server/internal/storage"
)

func submissionFixture(t *testing.T) (*Service, submissionInput) {
	t.Helper()
	s := testLibraryServer(t)
	if _, err := s.db.Exec("INSERT INTO inspiration_categories(id,name) VALUES('submission-category','摄影')"); err != nil {
		t.Fatal(err)
	}
	asset := uploadMaterial(t, s, "library-a", materialPNG(t, 90))
	return s, submissionInput{Title: "我的摄影提示词", CategoryID: "submission-category", Prompt: "一只陶瓷杯，柔和光线，产品摄影", CoverAssetID: asset, RequestKey: "submission-create-001", PublishConsent: true}
}
func submitRequest(t *testing.T, s *Service, method, path, uid string, input any) *httptest.ResponseRecorder {
	t.Helper()
	raw, _ := json.Marshal(input)
	return libraryHTTP(t, s, method, path, uid, string(raw))
}
func readSubmission(t *testing.T, w *httptest.ResponseRecorder) inspirationSubmission {
	t.Helper()
	if w.Code != 200 && w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	var data struct {
		Submission inspirationSubmission `json:"submission"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	return data.Submission
}
func approveInput(item inspirationSubmission, reward int64) submissionReview {
	return submissionReview{Version: item.Version, Decision: "approve", CategoryID: "submission-category", GrantReward: reward > 0, RewardMinor: reward}
}

func TestInspirationSubmissionPrivacyApprovalAndRewardRetries(t *testing.T) {
	t.Setenv("CDN_BASE_URL", "")
	s, input := submissionFixture(t)
	item := readSubmission(t, submitRequest(t, s, "POST", "/v1/personal/inspiration-submissions", "library-a", input))
	retry := readSubmission(t, submitRequest(t, s, "POST", "/v1/personal/inspiration-submissions", "library-a", input))
	if retry.ID != item.ID {
		t.Fatal("duplicate create")
	}
	for _, uid := range []string{"library-b", ""} {
		w := libraryHTTP(t, s, "GET", "/v1/personal/inspiration-submissions/"+item.ID, uid, "")
		if w.Code != 404 && w.Code != 401 {
			t.Fatal("private text leaked", uid, w.Code)
		}
	}
	for _, uid := range []string{"library-b", ""} {
		w := libraryHTTP(t, s, "GET", item.CoverPath, uid, "")
		if w.Code != 404 && w.Code != 401 {
			t.Fatal("private cover leaked", uid, w.Code)
		}
	}
	if w := libraryHTTP(t, s, "GET", item.CoverPath, "library-a", ""); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	adminCover := strings.Replace(item.CoverPath, "/personal/", "/admin/", 1)
	if w := inspirationRequest(t, s, "GET", adminCover, nil, "reviewer"); w.Code != 200 {
		t.Fatal("admin cannot inspect selected cover", w.Code, w.Body.String())
	}
	if w := libraryHTTP(t, s, "GET", adminCover, "library-a", ""); w.Code != 403 {
		t.Fatal("web session entered review", w.Code)
	}
	publicURL := "/v1/inspiration/images/community/" + item.ID + "-v1.jpg"
	if w := libraryHTTP(t, s, "GET", publicURL, "", ""); w.Code != 404 {
		t.Fatal("pending public image available", w.Code)
	}
	review := approveInput(item, 1000)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := inspirationRequest(t, s, "POST", "/v1/admin/inspiration-submissions/"+item.ID+"/review", review, "reviewer")
			if w.Code != 200 {
				t.Errorf("review retry: %d %s", w.Code, w.Body.String())
			}
		}()
	}
	wg.Wait()
	var balance, count, published int
	if err := s.db.QueryRow("SELECT available,(SELECT count(*) FROM credit_ledger WHERE kind='inspiration_reward'),(SELECT count(*) FROM inspiration_prompts WHERE enabled) FROM credit_accounts WHERE user_id='library-a'").Scan(&balance, &count, &published); err != nil || balance != 1000 || count != 1 || published != 1 {
		t.Fatal(balance, count, published, err)
	}
	if w := libraryHTTP(t, s, "GET", publicURL, "", ""); w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("approved cover inaccessible", w.Code)
	}
	rows := readInspirationList(t, inspirationRequest(t, s, "GET", "/v1/inspiration/prompts", nil, ""))
	if len(rows) != 1 || rows[0].Source != "用户投稿" {
		t.Fatal(rows)
	}
	if w := inspirationRequest(t, s, "PUT", "/v1/admin/inspiration/prompts/"+item.PublicationID, map[string]any{}, "reviewer"); w.Code != 409 {
		t.Fatal("public editor bypassed review", w.Code)
	}
}

func TestInspirationSubmissionRejectedRevisionAndOneRewardPerSubmission(t *testing.T) {
	s, input := submissionFixture(t)
	item := readSubmission(t, submitRequest(t, s, "POST", "/v1/personal/inspiration-submissions", "library-a", input))
	rejected := submissionReview{Version: 1, Decision: "reject", Reason: "请补充使用说明"}
	item = readSubmission(t, inspirationRequest(t, s, "POST", "/v1/admin/inspiration-submissions/"+item.ID+"/review", rejected, "reviewer"))
	if item.Status != "rejected" || item.ReviewReason == "" {
		t.Fatal(item)
	}
	if rows := readInspirationList(t, inspirationRequest(t, s, "GET", "/v1/inspiration/prompts", nil, "")); len(rows) != 0 {
		t.Fatal("rejected text leaked")
	}
	// Submission snapshots survive deletion of the selected personal asset.
	if w := libraryHTTP(t, s, "DELETE", "/v1/assets/"+input.CoverAssetID, "library-a", ""); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	input.CoverAssetID = ""
	input.Version = 1
	input.RequestKey = "submission-edit-002"
	input.Instructions = "适用于棚拍商品"
	item = readSubmission(t, submitRequest(t, s, "PUT", "/v1/personal/inspiration-submissions/"+item.ID, "library-a", input))
	retry := readSubmission(t, submitRequest(t, s, "PUT", "/v1/personal/inspiration-submissions/"+item.ID, "library-a", input))
	if retry.Version != 2 {
		t.Fatal(retry)
	}
	item = readSubmission(t, inspirationRequest(t, s, "POST", "/v1/admin/inspiration-submissions/"+item.ID+"/review", approveInput(item, 500), "reviewer"))
	input.Version = 2
	input.RequestKey = "submission-edit-003"
	input.Prompt += "，浅灰背景"
	item = readSubmission(t, submitRequest(t, s, "PUT", "/v1/personal/inspiration-submissions/"+item.ID, "library-a", input))
	if !item.Published || item.PublishedVersion != 2 {
		t.Fatal("approved old version vanished", item)
	}
	if w := inspirationRequest(t, s, "POST", "/v1/admin/inspiration-submissions/"+item.ID+"/review", approveInput(item, 500), "reviewer"); w.Code != 409 {
		t.Fatal("duplicate version reward", w.Code, w.Body.String())
	}
	item = readSubmission(t, inspirationRequest(t, s, "POST", "/v1/admin/inspiration-submissions/"+item.ID+"/review", approveInput(item, 0), "reviewer"))
	if item.RewardMinor != 500 || item.PublishedVersion != 3 {
		t.Fatal(item)
	}
	if w := submitRequest(t, s, "POST", "/v1/personal/inspiration-submissions/"+item.ID+"/withdraw", "library-a", map[string]any{"version": 3}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := libraryHTTP(t, s, "GET", "/v1/inspiration/images/community/"+item.ID+"-v3.jpg", "", ""); w.Code != 404 {
		t.Fatal("withdrawn cover still public", w.Code)
	}
	var total int
	if err := s.db.QueryRow("SELECT sum(available_delta) FROM credit_ledger WHERE kind='inspiration_reward'").Scan(&total); err != nil || total != 500 {
		t.Fatal(total, err)
	}
}

func TestInspirationSubmissionRewardFailureRollsBackPublication(t *testing.T) {
	s, input := submissionFixture(t)
	item := readSubmission(t, submitRequest(t, s, "POST", "/v1/personal/inspiration-submissions", "library-a", input))
	_, err := s.db.Exec(`CREATE FUNCTION reject_submission_reward() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='inspiration_reward' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_submission_reward BEFORE INSERT ON credit_ledger FOR EACH ROW EXECUTE FUNCTION reject_submission_reward()`)
	if err != nil {
		t.Fatal(err)
	}
	if w := inspirationRequest(t, s, "POST", "/v1/admin/inspiration-submissions/"+item.ID+"/review", approveInput(item, 100), "reviewer"); w.Code != 503 {
		t.Fatal(w.Code, w.Body.String())
	}
	var publications, balance int
	var status string
	if err = s.db.QueryRow("SELECT (SELECT count(*) FROM inspiration_prompts),available,(SELECT status FROM inspiration_submission_revisions WHERE submission_id=$1) FROM credit_accounts WHERE user_id='library-a'", item.ID).Scan(&publications, &balance, &status); err != nil || publications != 0 || balance != 0 || status != "pending" {
		t.Fatal(publications, balance, status, err)
	}
	if _, err = os.Stat(filepath.Join(s.storageRoot, "inspiration", "community", item.ID+"-v1.jpg")); !os.IsNotExist(err) {
		t.Fatal("failed publication cover retained", err)
	}
}

func TestInspirationSubmissionLimitsValidationAndCategoryChanges(t *testing.T) {
	s, input := submissionFixture(t)
	if _, err := s.db.Exec("UPDATE inspiration_submission_settings SET daily_limit=1"); err != nil {
		t.Fatal(err)
	}
	invalid := input
	invalid.PublishConsent = false
	if w := submitRequest(t, s, "POST", "/v1/personal/inspiration-submissions", "library-a", invalid); w.Code != 400 {
		t.Fatal(w.Code)
	}
	item := readSubmission(t, submitRequest(t, s, "POST", "/v1/personal/inspiration-submissions", "library-a", input))
	for _, reward := range []int64{-100, 1, 100000100} {
		bad := approveInput(item, reward)
		bad.GrantReward = true
		if w := inspirationRequest(t, s, "POST", "/v1/admin/inspiration-submissions/"+item.ID+"/review", bad, "reviewer"); w.Code != 400 {
			t.Fatal(reward, w.Code)
		}
	}
	if _, err := s.db.Exec("DELETE FROM inspiration_categories WHERE id='submission-category'"); err != nil {
		t.Fatal(err)
	}
	if w := inspirationRequest(t, s, "POST", "/v1/admin/inspiration-submissions/"+item.ID+"/review", approveInput(item, 0), "reviewer"); w.Code != 400 {
		t.Fatal(w.Code, w.Body.String())
	}
	for i := 0; i < 2; i++ {
		next := input
		next.RequestKey = fmt.Sprintf("new-submission-%d", i)
		next.Prompt += fmt.Sprint(i)
		if w := submitRequest(t, s, "POST", "/v1/personal/inspiration-submissions", "library-a", next); w.Code != 429 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	if w := inspirationRequest(t, s, "PUT", "/v1/admin/inspiration-submission-settings", submissionSettings{Enabled: false, DailyLimit: 5}, "reviewer"); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := submitRequest(t, s, "POST", "/v1/personal/inspiration-submissions", "library-a", submissionInput{Title: "新", Prompt: "新内容", CategoryID: "missing", RequestKey: "another-request", CoverAssetID: input.CoverAssetID, PublishConsent: true}); w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
}

type failingSubmissionPublicationStore struct{ objectstore.Store }

func (store failingSubmissionPublicationStore) Save(key string, data io.Reader) error {
	if strings.HasPrefix(key, "inspiration/community/") {
		return errors.New("fixture storage failure")
	}
	return store.Store.Save(key, data)
}

func TestInspirationSubmissionStorageFailureAndQuotaDoNotPublishOrReward(t *testing.T) {
	s, input := submissionFixture(t)
	item := readSubmission(t, submitRequest(t, s, "POST", "/v1/personal/inspiration-submissions", "library-a", input))
	original := s.storage
	s.storage = failingSubmissionPublicationStore{original}
	if w := inspirationRequest(t, s, "POST", "/v1/admin/inspiration-submissions/"+item.ID+"/review", approveInput(item, 100), "reviewer"); w.Code != 503 {
		t.Fatal(w.Code, w.Body.String())
	}
	s.storage = original
	if _, err := s.db.Exec(`UPDATE operation_settings SET config=jsonb_set(config,'{accountStorageLimitBytes}',to_jsonb(account_storage_bytes('library-a'))) WHERE id=true`); err != nil {
		t.Fatal(err)
	}
	if w := inspirationRequest(t, s, "POST", "/v1/admin/inspiration-submissions/"+item.ID+"/review", approveInput(item, 100), "reviewer"); w.Code != 413 {
		t.Fatal(w.Code, w.Body.String())
	}
	var balance, published, ledger int
	var status string
	if err := s.db.QueryRow(`SELECT available,(SELECT count(*) FROM inspiration_prompts),(SELECT count(*) FROM credit_ledger WHERE kind='inspiration_reward'),(SELECT status FROM inspiration_submission_revisions WHERE submission_id=$1) FROM credit_accounts WHERE user_id='library-a'`, item.ID).Scan(&balance, &published, &ledger, &status); err != nil || balance != 0 || published != 0 || ledger != 0 || status != "pending" {
		t.Fatal(balance, published, ledger, status, err)
	}
}

func TestInspirationSubmissionConcurrentDailyLimitAndForeignCover(t *testing.T) {
	s, input := submissionFixture(t)
	foreign := input
	if w := submitRequest(t, s, "POST", "/v1/personal/inspiration-submissions", "library-b", foreign); w.Code != 400 {
		t.Fatal("foreign cover accepted", w.Code, w.Body.String())
	}
	if _, err := s.db.Exec("UPDATE inspiration_submission_settings SET daily_limit=1"); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	codes := make(chan int, 6)
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			candidate := input
			candidate.Prompt += fmt.Sprint(i)
			candidate.RequestKey = fmt.Sprintf("concurrent-post-%d", i)
			w := submitRequest(t, s, "POST", "/v1/personal/inspiration-submissions", "library-a", candidate)
			codes <- w.Code
		}(i)
	}
	wg.Wait()
	close(codes)
	created, limited := 0, 0
	for code := range codes {
		if code == 201 {
			created++
		} else if code == 429 {
			limited++
		} else {
			t.Fatal("unexpected status", code)
		}
	}
	if created != 1 || limited != 5 {
		t.Fatal(created, limited)
	}
}

func TestInspirationSubmissionPersonalPromptFilterKeepsOwnerBoundary(t *testing.T) {
	s, input := submissionFixture(t)
	if _, err := s.db.Exec(`INSERT INTO personal_prompts(id,user_id,kind,title,prompt) VALUES('private-source','library-a','prompt','个人模板','测试模板')`); err != nil {
		t.Fatal(err)
	}
	input.PersonalPromptID = "private-source"
	item := readSubmission(t, submitRequest(t, s, "POST", "/v1/personal/inspiration-submissions", "library-a", input))
	for _, tc := range []struct {
		owner, filter string
		want          int
	}{{"library-a", "private-source", 1}, {"library-a", "missing-source", 0}, {"library-b", "private-source", 0}} {
		w := libraryHTTP(t, s, "GET", "/v1/personal/inspiration-submissions?personalPromptId="+tc.filter, tc.owner, "")
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
		var data struct {
			Submissions []inspirationSubmission `json:"submissions"`
			Total       int                     `json:"total"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
			t.Fatal(err)
		}
		if data.Total != tc.want || len(data.Submissions) != tc.want {
			t.Fatal(tc.owner, tc.filter, data)
		}
		if tc.want == 1 && data.Submissions[0].ID != item.ID {
			t.Fatal("wrong source submission returned")
		}
	}
}
