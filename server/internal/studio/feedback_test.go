package studio

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/istudio/server/internal/domain"
	objectstore "github.com/istudio/server/internal/storage"
)

func postFeedback(t *testing.T, s *Service, uid, key, content string, images ...[]byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	m := multipart.NewWriter(&body)
	for name, value := range map[string]string{"requestKey": key, "content": content, "pagePath": "/studio?prompt=private#secret"} {
		if err := m.WriteField(name, value); err != nil {
			t.Fatal(err)
		}
	}
	for _, data := range images {
		file, err := m.CreateFormFile("images", "untrusted.svg")
		if err != nil {
			t.Fatal(err)
		}
		if _, err = file.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := m.Close(); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("POST", "/v1/feedback", &body)
	r.Header.Set("Content-Type", m.FormDataContentType())
	if uid != "" {
		r.Header.Set("Authorization", "Bearer "+s.testToken(domain.User{ID: uid}))
	}
	w := httptest.NewRecorder()
	s.router().ServeHTTP(w, r)
	return w
}
func feedbackID(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	if w.Code != 201 && w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var result struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || result.ID == "" {
		t.Fatal(w.Body.String(), err)
	}
	return result.ID
}

func TestFeedbackSubmissionPrivacyAndAdminWorkflow(t *testing.T) {
	s := testLibraryServer(t)
	img := materialPNG(t, 70)
	id := feedbackID(t, postFeedback(t, s, "library-a", "feedback-001", "手机上传后按钮有点挤", img, img, img))
	if retry := feedbackID(t, postFeedback(t, s, "library-a", "feedback-001", "手机上传后按钮有点挤", img, img, img)); retry != id {
		t.Fatal("duplicate feedback")
	}
	if w := postFeedback(t, s, "library-a", "feedback-001", "changed", img); w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	var page string
	var assets, images int
	if err := s.db.QueryRow("SELECT page_path,(SELECT count(*) FROM assets),(SELECT count(*) FROM feedback_images WHERE feedback_id=$1) FROM feedback WHERE id=$1", id).Scan(&page, &assets, &images); err != nil || page != "/studio" || assets != 0 || images != 3 {
		t.Fatal(page, assets, images, err)
	}
	privatePath := "/v1/feedback/" + id + "/images/1"
	for _, uid := range []string{"", "library-b"} {
		w := libraryHTTP(t, s, "GET", privatePath, uid, "")
		if w.Code != 401 && w.Code != 404 {
			t.Fatal("private image leaked", uid, w.Code)
		}
	}
	if w := libraryHTTP(t, s, "GET", privatePath, "library-a", ""); w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" || !bytes.Equal(w.Body.Bytes(), img) {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := libraryHTTP(t, s, "GET", "/v1/admin/feedback", "library-a", ""); w.Code != 403 {
		t.Fatal("frontend entered admin", w.Code)
	}
	if w := inspirationRequest(t, s, "GET", "/v1/admin/feedback/"+id+"/images/2", nil, "feedback-admin"); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := libraryHTTP(t, s, "GET", "/v1/inspiration/images/feedback/anything.png", "", ""); w.Code != 404 {
		t.Fatal("feedback served publicly", w.Code)
	}
	w := inspirationRequest(t, s, "PATCH", "/v1/admin/feedback/"+id, map[string]string{"status": "handled"}, "feedback-admin")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"status":"handled"`) {
		t.Fatal(w.Code, w.Body.String())
	}
	w = inspirationRequest(t, s, "GET", "/v1/admin/feedback?status=handled&q=library_a&page=99&pageSize=1", nil, "feedback-admin")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"total":1`) || !strings.Contains(w.Body.String(), `"page":1`) {
		t.Fatal(w.Code, w.Body.String())
	}
	w = inspirationRequest(t, s, "GET", "/v1/admin/feedback?status=pending", nil, "feedback-admin")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"total":0`) {
		t.Fatal(w.Code, w.Body.String())
	}
	w = inspirationRequest(t, s, "PATCH", "/v1/admin/feedback/"+id, map[string]string{"status": "pending"}, "feedback-admin")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"handledAt":null`) {
		t.Fatal(w.Code, w.Body.String())
	}
}

func TestFeedbackValidationAndConcurrentDailyLimit(t *testing.T) {
	s := testLibraryServer(t)
	img := materialPNG(t, 10)
	for _, test := range []struct {
		key, content string
		images       [][]byte
	}{{"feedback-empty", "  ", nil}, {"feedback-long", strings.Repeat("字", 2001), nil}, {"feedback-image", "broken", [][]byte{[]byte("not an image")}}, {"feedback-size", "large", [][]byte{bytes.Repeat([]byte("a"), feedbackImageLimit+1)}}, {"feedback-count", "four", [][]byte{img, img, img, img}}} {
		w := postFeedback(t, s, "library-a", test.key, test.content, test.images...)
		if w.Code != 400 {
			t.Fatal(test.key, w.Code, w.Body.String())
		}
	}
	if w := postFeedback(t, s, "", "feedback-guest", "guest"); w.Code != 401 {
		t.Fatal(w.Code)
	}
	var wg sync.WaitGroup
	codes := make(chan int, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			codes <- postFeedback(t, s, "library-a", fmt.Sprintf("feedback-race-%d", i), "并发反馈").Code
		}(i)
	}
	wg.Wait()
	close(codes)
	created, limited := 0, 0
	for code := range codes {
		switch code {
		case 201:
			created++
		case 429:
			limited++
		default:
			t.Fatal("unexpected status", code)
		}
	}
	if created != 5 || limited != 3 {
		t.Fatal(created, limited)
	}
	// The Shanghai day boundary resets independently of the database timezone.
	if _, err := s.db.Exec("UPDATE feedback SET created_at=now()-interval '2 days'"); err != nil {
		t.Fatal(err)
	}
	feedbackID(t, postFeedback(t, s, "library-a", "feedback-next-day", "第二天可提交"))
}

type feedbackFailingStore struct {
	objectstore.Store
	calls int
}

func (f *feedbackFailingStore) Save(key string, r io.Reader) error {
	f.calls++
	if f.calls == 2 {
		_ = f.Store.Save(key, strings.NewReader("partial"))
		return errors.New("fixture failure")
	}
	return f.Store.Save(key, r)
}
func TestFeedbackStorageFailureRollsBackAndRetryDoesNotDuplicate(t *testing.T) {
	s := testLibraryServer(t)
	img := materialPNG(t, 18)
	original := s.storage
	s.storage = &feedbackFailingStore{Store: original}
	if w := postFeedback(t, s, "library-a", "feedback-storage", "附件失败", img, img); w.Code != 503 {
		t.Fatal(w.Code, w.Body.String())
	}
	var count int
	if err := s.db.QueryRow("SELECT count(*) FROM feedback").Scan(&count); err != nil || count != 0 {
		t.Fatal(count, err)
	}
	if err := filepath.Walk(s.storageRoot, func(p string, i os.FileInfo, e error) error {
		if e == nil && !i.IsDir() {
			t.Errorf("orphan feedback file: %s", p)
		}
		return e
	}); err != nil {
		t.Fatal(err)
	}
	s.storage = original
	var wg sync.WaitGroup
	ids := make(chan string, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ids <- feedbackID(t, postFeedback(t, s, "library-a", "feedback-storage", "附件失败", img, img))
		}()
	}
	wg.Wait()
	close(ids)
	unique := map[string]bool{}
	for id := range ids {
		unique[id] = true
	}
	if len(unique) != 1 {
		t.Fatal(unique)
	}
}

func TestFeedbackPagePathRemovesPrivateParameters(t *testing.T) {
	for raw, want := range map[string]string{"/studio?prompt=secret#token": "/studio", "/assets?view=tasks": "/assets", "": "/"} {
		got, err := feedbackPagePath(raw)
		if err != nil || got != want {
			t.Fatal(got, err)
		}
	}
	for _, raw := range []string{"https://other.test/page", "//other.test/page", "/bad\\path", "/bad%0Apath"} {
		if _, err := feedbackPagePath(raw); err == nil {
			t.Fatal("accepted bad source", raw)
		}
	}
}
