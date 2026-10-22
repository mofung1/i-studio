package studio

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/istudio/server/internal/domain"
	"github.com/istudio/server/internal/idgen"
)

// All daily budgets use the server's Shanghai calendar, independent of the
// browser and PostgreSQL session timezone.
const platformDaySQL = `(date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')`

var errAuxiliaryBusy = &operationError{429, "PLATFORM_AUXILIARY_BUSY", "平台辅助服务繁忙，请稍后再试"}

func (s *Service) acquireAuxiliary(ctx context.Context, uid, kind string) (context.Context, func(), error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	if s.db == nil {
		return ctx, cancel, nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		cancel()
		return nil, nil, err
	}
	defer tx.Rollback()
	var raw []byte
	err = tx.QueryRowContext(ctx, "SELECT config FROM operation_settings WHERE id=true FOR SHARE").Scan(&raw)
	c := defaultOperationSettings()
	if err == nil {
		err = json.Unmarshal(raw, &c)
	}
	if err == nil {
		_, err = tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock(724091029)")
	}
	var active, today int
	if err == nil {
		err = tx.QueryRowContext(ctx, `SELECT count(*) FILTER(WHERE finished_at IS NULL AND lease_until>now()),count(*) FILTER(WHERE started_at>=`+platformDaySQL+`) FROM auxiliary_runs WHERE lease_until>now() OR started_at>=`+platformDaySQL).Scan(&active, &today)
	}
	if err == nil && active >= c.PlatformAuxiliaryConcurrent {
		err = errAuxiliaryBusy
	}
	if err == nil && today >= c.PlatformAuxiliaryPerDay {
		err = &operationError{429, "PLATFORM_AUXILIARY_DAILY_LIMIT", "平台今日辅助服务额度已用完，请明天再试"}
	}
	id := idgen.New()
	if err == nil {
		_, err = tx.ExecContext(ctx, "INSERT INTO auxiliary_runs(id,user_id,kind,lease_until) VALUES($1,$2,$3,now()+interval '11 minutes')", id, uid, kind)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		cancel()
		return nil, nil, err
	}
	return ctx, func() {
		cancel()
		cleanupCtx, stop := context.WithTimeout(context.Background(), 3*time.Second)
		defer stop()
		_, _ = s.db.ExecContext(cleanupCtx, "UPDATE auxiliary_runs SET finished_at=now(),lease_until=now() WHERE id=$1 AND finished_at IS NULL", id)
	}, nil
}

func (s *Service) auxiliaryFailure(w http.ResponseWriter, err error) {
	var limit *operationError
	if errors.As(err, &limit) {
		w.Header().Set("Retry-After", "60")
		s.operationFailure(w, err)
		return
	}
	s.error(w, 503, "AUXILIARY_UNAVAILABLE", "辅助服务暂时不可用，请稍后再试")
}

func isStorageQuotaError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "account storage quota exceeded")
}

func (s *Service) ensureStorageCapacity(ctx context.Context, tx *sql.Tx, uid string, incoming int64) error {
	if _, err := tx.ExecContext(ctx, "SELECT id FROM users WHERE id=$1 FOR KEY SHARE", uid); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock(724091030,hashtext($1))", uid); err != nil {
		return err
	}
	var used, limit int64
	if err := tx.QueryRowContext(ctx, "SELECT account_storage_bytes($1),COALESCE((config->>'accountStorageLimitBytes')::bigint,1073741824) FROM operation_settings WHERE id=true", uid).Scan(&used, &limit); err != nil {
		return err
	}
	if incoming < 0 || used > limit-incoming {
		return &operationError{413, "ACCOUNT_STORAGE_QUOTA", "账号存储额度不足，请清理不再需要的作品、素材或反推记录后重试；历史引用的素材仍占用空间"}
	}
	return nil
}

func inviteHash(code string) string {
	digest := sha256.Sum256([]byte(code))
	return hex.EncodeToString(digest[:])
}

func (s *Service) registerAccount(u domain.User, invite string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var raw []byte
	err = tx.QueryRow("SELECT config FROM operation_settings WHERE id=true FOR SHARE").Scan(&raw)
	c := defaultOperationSettings()
	if err == nil {
		err = json.Unmarshal(raw, &c)
	}
	if err != nil {
		return err
	}
	if !c.RegistrationEnabled {
		return &operationError{403, "REGISTRATION_CLOSED", "网站暂未开放注册"}
	}
	if c.RegistrationInviteRequired {
		var expected string
		if err = tx.QueryRow("SELECT code_hash FROM registration_invite WHERE id=true").Scan(&expected); err != nil {
			return &operationError{403, "INVITE_REQUIRED", "注册需要有效邀请码"}
		}
		if subtle.ConstantTimeCompare([]byte(inviteHash(invite)), []byte(expected)) != 1 {
			return &operationError{403, "INVITE_REQUIRED", "注册需要有效邀请码"}
		}
	}
	if _, err = tx.Exec("SELECT pg_advisory_xact_lock(724091028)"); err != nil {
		return err
	}
	var used int64
	if err = tx.QueryRow("SELECT COALESCE(sum(available_delta),0) FROM credit_ledger WHERE kind='signup' AND created_at>=" + platformDaySQL).Scan(&used); err != nil {
		return err
	}
	if c.SignupGiftMinor > 0 && used > c.SignupGiftDailyBudgetMinor-c.SignupGiftMinor {
		return &operationError{503, "REGISTRATION_BUDGET_EXHAUSTED", "今日注册赠送额度已用完，请明天再试或联系管理员"}
	}
	_, err = tx.Exec("INSERT INTO users(id,username,password_hash) VALUES($1,$2,$3)", u.ID, u.Username, u.PasswordHash)
	if err == nil {
		_, err = tx.Exec("INSERT INTO credit_accounts(user_id,available) VALUES($1,$2)", u.ID, c.SignupGiftMinor)
	}
	if err == nil && c.SignupGiftMinor > 0 {
		_, err = tx.Exec(`INSERT INTO credit_ledger(user_id,kind,available_delta,held_delta,available_after,held_after,request_key,note) VALUES($1,'signup',$2,0,$2,0,'signup','注册赠送')`, u.ID, c.SignupGiftMinor)
	}
	if err == nil {
		err = tx.Commit()
	}
	return err
}
