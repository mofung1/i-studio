package studio

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/istudio/server/internal/domain"
)

func registerAccountForTest(t *testing.T, s *Service, u domain.User, gift int64) error {
	t.Helper()
	if _, err := s.db.Exec("UPDATE operation_settings SET config=config||jsonb_build_object('signupGiftMinor',$1::bigint)", gift); err != nil {
		t.Fatal(err)
	}
	return s.registerAccount(u, "")
}

func setPlatformSettings(t *testing.T, s *Service, patch string) {
	t.Helper()
	if _, err := s.db.Exec("UPDATE operation_settings SET config=config||$1::jsonb", patch); err != nil {
		t.Fatal(err)
	}
}

func TestSignupBudgetIsAtomicAcrossAccountsAndPolicyIsCurrent(t *testing.T) {
	s, _, _ := operationTestServer(t)
	setPlatformSettings(t, s, `{"signupGiftMinor":250,"signupGiftDailyBudgetMinor":500}`)
	var wg sync.WaitGroup
	var mu sync.Mutex
	success := 0
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			err := s.registerAccount(domain.User{ID: fmt.Sprintf("signup-%d", i), Username: fmt.Sprintf("signup_%d", i), PasswordHash: "test"}, "")
			if err == nil {
				mu.Lock()
				success++
				mu.Unlock()
			} else {
				var problem *operationError
				if !errors.As(err, &problem) || problem.code != "REGISTRATION_BUDGET_EXHAUSTED" {
					t.Error(err)
				}
			}
		}(i)
	}
	wg.Wait()
	var total, accounts int64
	if err := s.db.QueryRow("SELECT COALESCE(sum(available_delta),0),count(*) FROM credit_ledger WHERE kind='signup'").Scan(&total, &accounts); err != nil || total != 500 || accounts != 2 || success != 2 {
		t.Fatal(success, total, accounts, err)
	}
	var half int
	s.db.QueryRow("SELECT count(*) FROM users u LEFT JOIN credit_accounts c ON c.user_id=u.id WHERE u.id LIKE 'signup-%' AND c.user_id IS NULL").Scan(&half)
	if half != 0 {
		t.Fatal("registration left an account without a wallet")
	}
	setPlatformSettings(t, s, `{"signupGiftMinor":0,"signupGiftDailyBudgetMinor":0}`)
	if err := s.registerAccount(domain.User{ID: "no-gift", Username: "no_gift", PasswordHash: "test"}, ""); err != nil {
		t.Fatal(err)
	}
	setPlatformSettings(t, s, `{"registrationEnabled":false}`)
	if err := s.registerAccount(domain.User{ID: "closed", Username: "closed", PasswordHash: "test"}, ""); err == nil {
		t.Fatal("closed registration bypassed")
	}
}

func TestInviteConfigurationDoesNotLeakAndIsEnforced(t *testing.T) {
	s, _, _ := operationTestServer(t)
	admin := s.testAdminToken(domain.User{ID: "operator"})
	w := operationRequest(s, "PUT", "/v1/admin/settings", `{"registrationInviteRequired":true,"registrationInviteCode":"PrivateInvite_123"}`, admin, s.router().ServeHTTP)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "PrivateInvite_123") {
		t.Fatal(w.Code, w.Body.String())
	}

	read := operationRequest(s, "GET", "/v1/admin/settings", "", admin, s.router().ServeHTTP)
	if read.Code != 200 || !strings.Contains(read.Body.String(), "PrivateInvite_123") || read.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("administrator could not read invite", read.Code)
	}
	var encrypted string
	if err := s.db.QueryRow("SELECT code_encrypted FROM registration_invite WHERE id=true").Scan(&encrypted); err != nil || strings.Contains(encrypted, "PrivateInvite_123") || encrypted == "" {
		t.Fatal("invite not encrypted", err)
	}
	member := s.testToken(domain.User{ID: "ordinary-member"})
	denied := operationRequest(s, "GET", "/v1/admin/settings", "", member, s.router().ServeHTTP)
	if denied.Code != 403 || strings.Contains(denied.Body.String(), "PrivateInvite_123") {
		t.Fatal("member read invite", denied.Code)
	}
	for _, code := range []string{"", "wrong-code"} {
		if err := s.registerAccount(domain.User{ID: "invite-user", Username: "invite_user", PasswordHash: "test"}, code); err == nil {
			t.Fatal("bad invite accepted")
		}
	}
	if err := s.registerAccount(domain.User{ID: "invite-user", Username: "invite_user", PasswordHash: "test"}, "PrivateInvite_123"); err != nil {
		t.Fatal(err)
	}
	public := operationRequest(s, "GET", "/v1/operation-settings", "", "", s.publicOperationSettings)
	if !strings.Contains(public.Body.String(), `"registrationInviteRequired":true`) || strings.Contains(public.Body.String(), "PrivateInvite") || strings.Contains(public.Body.String(), "Hash") {
		t.Fatal(public.Body.String())
	}
	var leaked int
	if err := s.db.QueryRow("SELECT count(*) FROM admin_audit WHERE detail LIKE '%PrivateInvite_123%'").Scan(&leaked); err != nil || leaked != 0 {
		t.Fatal("invite leaked into audit", err)
	}
	var stored string
	s.db.QueryRow("SELECT code_hash FROM registration_invite WHERE id=true").Scan(&stored)
	if stored == "PrivateInvite_123" || stored == "" {
		t.Fatal("invite not hashed")
	}
}

func TestAuxiliaryPlatformConcurrencyAndDailyLimitAcrossUsers(t *testing.T) {
	s, _, _ := operationTestServer(t)
	setPlatformSettings(t, s, `{"platformAuxiliaryConcurrent":2,"platformAuxiliaryPerDay":3}`)
	for i := 0; i < 12; i++ {
		s.testToken(domain.User{ID: fmt.Sprintf("aux-%d", i)})
	}
	var wg sync.WaitGroup
	var mu sync.Mutex
	releases := []func(){}
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, release, err := s.acquireAuxiliary(context.Background(), fmt.Sprintf("aux-%d", i), "test")
			if err == nil {
				mu.Lock()
				releases = append(releases, release)
				mu.Unlock()
			} else if !errors.Is(err, errAuxiliaryBusy) {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	if len(releases) != 2 {
		t.Fatal("platform concurrency bypassed", len(releases))
	}
	for _, release := range releases {
		release()
		release()
	}
	ctx, release, err := s.acquireAuxiliary(context.Background(), "member", "test")
	if err != nil || ctx.Err() != nil {
		t.Fatal(err)
	}
	release()
	_, _, err = s.acquireAuxiliary(context.Background(), "member", "test")
	var problem *operationError
	if !errors.As(err, &problem) || problem.code != "PLATFORM_AUXILIARY_DAILY_LIMIT" {
		t.Fatal("daily budget bypassed", err)
	}
	if _, err = s.db.Exec("UPDATE auxiliary_runs SET started_at=" + platformDaySQL + "-interval '1 second'"); err != nil {
		t.Fatal(err)
	}
	_, release, err = s.acquireAuxiliary(context.Background(), "member", "test")
	if err != nil {
		t.Fatal("daily budget did not reset", err)
	}
	release()
}

func TestStorageQuotaSerializesAssetsAndCountsRetainedAndTemporaryBytes(t *testing.T) {
	s, _, _ := operationTestServer(t)
	setPlatformSettings(t, s, `{"accountStorageLimitBytes":100}`)
	var wg sync.WaitGroup
	var mu sync.Mutex
	inserted := 0
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			id := fmt.Sprintf("quota-%d", i)
			_, err := s.db.Exec("INSERT INTO assets(id,user_id,filename,storage_key,mime,size_bytes) VALUES($1,'member','test.png',$1,'image/png',80)", id)
			if err == nil {
				mu.Lock()
				inserted++
				mu.Unlock()
			} else if !isStorageQuotaError(err) {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	if inserted != 1 {
		t.Fatal("concurrent inserts bypassed quota", inserted)
	}
	if _, err := s.db.Exec("UPDATE assets SET hidden_at=now() WHERE user_id='member'"); err != nil {
		t.Fatal(err)
	}
	var used int64
	s.db.QueryRow("SELECT account_storage_bytes('member')").Scan(&used)
	if used != 80 {
		t.Fatal("retained source was incorrectly freed", used)
	}
	if _, err := s.db.Exec("DELETE FROM assets WHERE user_id='member'"); err != nil {
		t.Fatal(err)
	}
	tx, _ := s.db.Begin()
	if err := s.ensureStorageCapacity(context.Background(), tx, "member", 100); err != nil {
		t.Fatal("deleted bytes not reclaimed", err)
	}
	tx.Rollback()
}

func TestReverseTemporaryFilesCountTowardQuotaAndCleanupReclaims(t *testing.T) {
	s, _ := testReverseServer(t, nil)
	data := siteLogoBytes(t, "png")
	setPlatformSettings(t, s, fmt.Sprintf(`{"accountStorageLimitBytes":%d}`, len(data)))
	w := reverseHTTP(t, s, "POST", "/v1/prompts/reverse", "reverse-alice", map[string]string{"mode": "scene", "requestId": "quota-reverse-001"}, data)
	if w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	var task struct {
		Task reverseTask `json:"task"`
	}
	json.Unmarshal(w.Body.Bytes(), &task)
	w = reverseHTTP(t, s, "POST", "/v1/prompts/reverse", "reverse-alice", map[string]string{"mode": "scene", "requestId": "quota-reverse-002"}, data)
	if w.Code != 413 {
		t.Fatal("temporary files bypass quota", w.Code, w.Body.String())
	}
	if _, err := s.db.Exec("UPDATE prompt_reverse_tasks SET status='failed',expires_at=now()-interval '1 second' WHERE id=$1", task.Task.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.cleanupReverseTasks(); err != nil {
		t.Fatal(err)
	}
	var used int64
	s.db.QueryRow("SELECT account_storage_bytes('reverse-alice')").Scan(&used)
	if used != 0 {
		t.Fatal("expired temporary files not reclaimed", used)
	}
}

func TestGenerationStorageQuotaFailureRefundsAndExposesDimensions(t *testing.T) {
	s, job, source := deliveryFixture(t, 2)
	data := siteLogoBytes(t, "png")
	setPlatformSettings(t, s, fmt.Sprintf(`{"accountStorageLimitBytes":%d}`, len(data)))
	s.provider = &deliveryTestProvider{submit: func(context.Context, map[string]any) (providerTask, error) {
		return providerTask{Images: []string{source}}, nil
	}}
	q := &taskQueue{server: s}
	q.processTask(job.ID)
	final := assertDeliverySettlement(t, s, job.ID, "failed", 1, 2)
	if !strings.Contains(final.ErrorMessage, "存储额度") || len(final.ResultDetails) != 1 || final.ResultDetails[0].Width == 0 || final.ResultDetails[0].ElapsedMS == nil {
		t.Fatal("quota error or actual dimensions missing", final)
	}
}
