package studio

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/istudio/server/internal/domain"
)

func enableCheckin(t *testing.T, s *Service, reward, budget int64) {
	t.Helper()
	setPlatformSettings(t, s, fmt.Sprintf(`{"checkinEnabled":true,"checkinRewardMinor":%d,"checkinDailyBudgetMinor":%d}`, reward, budget))
}

func TestCheckinConcurrentRetriesAndSettingsChanges(t *testing.T) {
	s, _, _ := operationTestServer(t)
	enableCheckin(t, s, 125, 10000)
	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			state, available, held, err := s.claimCheckin(context.Background(), "member")
			if err != nil || !state.Claimed || state.ClaimedRewardMinor != 125 || available != 10125 || held != 0 {
				t.Errorf("claim result: %+v %d/%d err=%v", state, available, held, err)
			}
		}()
	}
	wg.Wait()
	var count, ledger, available, held int64
	if err := s.db.QueryRow("SELECT (SELECT count(*) FROM daily_checkins WHERE user_id='member'),(SELECT count(*) FROM credit_ledger WHERE user_id='member' AND kind='checkin'),available,held FROM credit_accounts WHERE user_id='member'").Scan(&count, &ledger, &available, &held); err != nil {
		t.Fatal(err)
	}
	if count != 1 || ledger != 1 || available != 10125 || held != 0 {
		t.Fatal("duplicate reward", count, ledger, available, held)
	}
	setPlatformSettings(t, s, `{"checkinEnabled":false,"checkinRewardMinor":500}`)
	state, _, _, err := s.claimCheckin(context.Background(), "member")
	if err != nil || !state.Claimed || state.ClaimedRewardMinor != 125 {
		t.Fatal(state, err)
	}
	enableCheckin(t, s, 500, 10000)
	state, available, _, err = s.claimCheckin(context.Background(), "member")
	if err != nil || available != 10125 || state.ClaimedRewardMinor != 125 || state.CanClaim {
		t.Fatal("reopening duplicated reward", state, available, err)
	}
	// Reconstruct the service to verify that idempotency lives in PostgreSQL.
	restarted := &Service{db: s.db}
	if _, available, _, err = restarted.claimCheckin(context.Background(), "member"); err != nil || available != 10125 {
		t.Fatal("restart duplicated reward", available, err)
	}
}

func TestCheckinBudgetAcrossUsersAndNaturalDay(t *testing.T) {
	s, _, _ := operationTestServer(t)
	enableCheckin(t, s, 125, 250)
	var wg sync.WaitGroup
	var mu sync.Mutex
	success := []string{}
	for i := 0; i < 8; i++ {
		uid := fmt.Sprintf("daily-%d", i)
		s.testToken(domain.User{ID: uid})
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _, _, err := s.claimCheckin(context.Background(), uid)
			if err == nil {
				mu.Lock()
				success = append(success, uid)
				mu.Unlock()
			} else if problem, ok := err.(*operationError); !ok || problem.code != "CHECKIN_BUDGET_EXHAUSTED" {
				t.Errorf("unexpected claim error: %v", err)
			}
		}()
	}
	wg.Wait()
	if len(success) != 2 {
		t.Fatalf("budget allowed %d awards", len(success))
	}
	var total int64
	if err := s.db.QueryRow("SELECT sum(reward_minor) FROM daily_checkins").Scan(&total); err != nil || total != 250 {
		t.Fatal(total, err)
	}
	if _, _, _, err := s.claimCheckin(context.Background(), success[0]); err != nil {
		t.Fatal("retry after budget exhaustion", err)
	}
	// Yesterday's synthetic award does not consume today's budget or block a new claim.
	if _, err := s.db.Exec("UPDATE daily_checkins SET claim_day=claim_day-1; UPDATE credit_ledger SET request_key='checkin:'||((statement_timestamp() AT TIME ZONE 'Asia/Shanghai')::date-1)::text,created_at=now()-interval '1 day' WHERE kind='checkin'"); err != nil {
		t.Fatal(err)
	}
	state, available, _, err := s.claimCheckin(context.Background(), success[0])
	if err != nil || !state.Claimed || available != 250 {
		t.Fatal(state, available, err)
	}
	tx, err := s.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err = tx.Exec("SET LOCAL TIME ZONE 'Pacific/Honolulu'"); err != nil {
		t.Fatal(err)
	}
	c, _ := s.operationSettings()
	state, err = readCheckinState(context.Background(), tx, c, success[0])
	want := time.Now().In(time.FixedZone("CST", 8*60*60)).Format("2006-01-02")
	if err != nil || state.Date != want || state.NextClaimAt.In(time.FixedZone("CST", 8*60*60)).Hour() != 0 {
		t.Fatal("calendar depends on session timezone", state, err)
	}
}

func TestCheckinPermissionsClosedZeroAndAtomicRollback(t *testing.T) {
	s, _, _ := operationTestServer(t)
	token := s.testToken(domain.User{ID: "member"})
	for _, config := range []string{`{"checkinEnabled":false,"checkinRewardMinor":100}`, `{"checkinEnabled":true,"checkinRewardMinor":0}`} {
		setPlatformSettings(t, s, config)
		w := operationRequest(s, "POST", "/v1/account/checkin", "", token, s.router().ServeHTTP)
		if w.Code != 409 || !strings.Contains(w.Body.String(), "CHECKIN_CLOSED") {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	enableCheckin(t, s, 100, 10000)
	for _, token := range []string{"", s.testAdminToken(domain.User{ID: "operator"})} {
		w := operationRequest(s, "POST", "/v1/account/checkin", "", token, s.router().ServeHTTP)
		if w.Code != 401 {
			t.Fatal("non-web account claimed", w.Code)
		}
	}
	if _, err := s.db.Exec(`CREATE FUNCTION reject_checkin_ledger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.kind='checkin' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END$$; CREATE TRIGGER reject_checkin BEFORE INSERT ON credit_ledger FOR EACH ROW EXECUTE FUNCTION reject_checkin_ledger()`); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := s.claimCheckin(context.Background(), "member"); err == nil {
		t.Fatal("ledger failure accepted")
	}
	var count, balance int
	if err := s.db.QueryRow("SELECT (SELECT count(*) FROM daily_checkins),available FROM credit_accounts WHERE user_id='member'").Scan(&count, &balance); err != nil || count != 0 || balance != 10000 {
		t.Fatal("partial reward committed", count, balance, err)
	}
	if _, err := s.db.Exec("DROP TRIGGER reject_checkin ON credit_ledger"); err != nil {
		t.Fatal(err)
	}
	w := operationRequest(s, "POST", "/v1/account/checkin", `{"userId":"operator","rewardMinor":999999,"date":"2099-01-01"}`, token, s.router().ServeHTTP)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var reward int64
	if err := s.db.QueryRow("SELECT reward_minor FROM daily_checkins WHERE user_id='member'").Scan(&reward); err != nil || reward != 100 {
		t.Fatal("client chose award", reward, err)
	}
	if _, err := s.db.Exec("UPDATE users SET status='disabled' WHERE id='member'"); err != nil {
		t.Fatal(err)
	}
	if w = operationRequest(s, "POST", "/v1/account/checkin", "", token, s.router().ServeHTTP); w.Code != 401 {
		t.Fatal("disabled account accepted", w.Code)
	}
}

func TestSignupGiftSettingsAndPublicAccountLifecycle(t *testing.T) {
	s, _, _ := operationTestServer(t)
	admin := s.testAdminToken(domain.User{ID: "operator"})
	put := func(body string) *httptest.ResponseRecorder {
		return operationRequest(s, "PUT", "/v1/admin/settings", body, admin, s.router().ServeHTTP)
	}
	if w := put(`{"signupGiftMinor":125,"creditName":"创作币"}`); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if c, err := s.operationSettings(); err != nil || c.SignupGiftMinor != 125 {
		t.Fatal(c, err)
	}
	register := func(name string) (string, string) {
		t.Helper()
		body := fmt.Sprintf(`{"username":%q,"password":"Acceptance-pass-1234"}`, name)
		w := operationRequest(s, "POST", "/v1/auth/register", body, "", s.router().ServeHTTP)
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
		var result struct {
			AccessToken string `json:"accessToken"`
			User        struct {
				ID string `json:"id"`
			} `json:"user"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result.User.ID, result.AccessToken
	}
	id, token := register("signup_gift_a")
	w := operationRequest(s, "GET", "/v1/account", "", token, s.router().ServeHTTP)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"available":125`) || !strings.Contains(w.Body.String(), `"kind":"signup"`) {
		t.Fatal(w.Code, w.Body.String())
	}
	w = operationRequest(s, "POST", "/v1/auth/register", `{"username":"signup_gift_a","password":"Acceptance-pass-1234"}`, "", s.router().ServeHTTP)
	if w.Code != 409 {
		t.Fatal("repeat registration accepted", w.Code)
	}
	restarted := &Service{db: s.db, secret: s.secret}
	w = operationRequest(restarted, "POST", "/v1/auth/login", `{"username":"signup_gift_a","password":"Acceptance-pass-1234"}`, "", restarted.login)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = put(`{"signupGiftMinor":0}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	zero, _ := register("signup_gift_zero")
	if w = put(`{"signupGiftMinor":250}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	updated, _ := register("signup_gift_b")
	for uid, want := range map[string]int64{id: 125, zero: 0, updated: 250, "member": 10000} {
		var available, ledger int64
		if err := s.db.QueryRow("SELECT available,(SELECT count(*) FROM credit_ledger WHERE user_id=$1 AND kind='signup') FROM credit_accounts WHERE user_id=$1", uid).Scan(&available, &ledger); err != nil || available != want {
			t.Fatal(uid, available, want, err)
		}
		if uid != "member" && ((want == 0 && ledger != 0) || (want > 0 && ledger != 1)) {
			t.Fatal("gift ledger mismatch", uid, ledger)
		}
	}
	for _, body := range []string{`{"signupGiftMinor":-1}`, `{"signupGiftMinor":1.25}`, `{"signupGiftMinor":100000001}`, `{"checkinRewardMinor":-1}`, `{"announcementEnabled":true}`} {
		if w = put(body); w.Code != 400 {
			t.Fatal("invalid settings accepted", body, w.Code)
		}
	}
	if w = operationRequest(s, "PUT", "/v1/admin/settings", `{"signupGiftMinor":999}`, token, s.router().ServeHTTP); w.Code != 403 {
		t.Fatal("member edited gifts", w.Code)
	}
	var audits int
	if err := s.db.QueryRow("SELECT count(*) FROM admin_audit WHERE action='settings.update'").Scan(&audits); err != nil || audits != 3 {
		t.Fatal("settings not audited", audits, err)
	}
}

func TestAnnouncementDraftPublicationAndVersion(t *testing.T) {
	c := defaultOperationSettings()
	c.AnnouncementTitle = "维护公告"
	c.AnnouncementContent = "第一行\n<script>alert(1)</script>"
	if publishedAnnouncement(c) != nil {
		t.Fatal("draft published")
	}
	c.AnnouncementEnabled = true
	a := publishedAnnouncement(c)
	if !validOperationSettings(c) || a.Content != c.AnnouncementContent || a.ID == "" {
		t.Fatal(a)
	}
	c.AnnouncementContent += "更新"
	if publishedAnnouncement(c).ID == a.ID {
		t.Fatal("updated announcement has stale version")
	}
	c.AnnouncementContent = strings.Repeat("字", 2001)
	if validOperationSettings(c) {
		t.Fatal("unbounded announcement accepted")
	}

}

func TestSignupGiftConcurrentSubmissionAndLedgerRollback(t *testing.T) {
	s, _, _ := operationTestServer(t)
	setPlatformSettings(t, s, `{"signupGiftMinor":175}`)
	var wg sync.WaitGroup
	var mu sync.Mutex
	success := 0
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := operationRequest(s, "POST", "/v1/auth/register", `{"username":"same_signup","password":"Acceptance-pass-1234"}`, "", s.router().ServeHTTP)
			if w.Code == 200 {
				mu.Lock()
				success++
				mu.Unlock()
			} else if w.Code != 409 {
				t.Errorf("unexpected register response: %d", w.Code)
			}
		}()
	}
	wg.Wait()
	if success != 1 {
		t.Fatal("duplicate registration", success)
	}
	var available, entries int64
	if err := s.db.QueryRow("SELECT c.available,(SELECT count(*) FROM credit_ledger l WHERE l.user_id=u.id AND l.kind='signup') FROM users u JOIN credit_accounts c ON c.user_id=u.id WHERE u.username='same_signup'").Scan(&available, &entries); err != nil || available != 175 || entries != 1 {
		t.Fatal(available, entries, err)
	}
	if _, err := s.db.Exec(`CREATE FUNCTION reject_signup_ledger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.kind='signup' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END$$; CREATE TRIGGER reject_signup BEFORE INSERT ON credit_ledger FOR EACH ROW EXECUTE FUNCTION reject_signup_ledger()`); err != nil {
		t.Fatal(err)
	}
	w := operationRequest(s, "POST", "/v1/auth/register", `{"username":"rollback_signup","password":"Acceptance-pass-1234"}`, "", s.router().ServeHTTP)
	if w.Code != 503 {
		t.Fatal(w.Code, w.Body.String())
	}
	var users int
	if err := s.db.QueryRow("SELECT count(*) FROM users WHERE username='rollback_signup'").Scan(&users); err != nil || users != 0 {
		t.Fatal("partially committed registration", users, err)
	}
}
