package studio

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

type checkinState struct {
	Enabled             bool      `json:"enabled"`
	RewardMinor         int64     `json:"rewardMinor"`
	Claimed             bool      `json:"claimed"`
	ClaimedRewardMinor  int64     `json:"claimedRewardMinor"`
	CanClaim            bool      `json:"canClaim"`
	Date                string    `json:"date"`
	NextClaimAt         time.Time `json:"nextClaimAt"`
	RefreshAfterSeconds int       `json:"refreshAfterSeconds"`
	UnavailableReason   string    `json:"unavailableReason"`
}

type creditPolicy struct {
	SignupGiftMinor int64        `json:"signupGiftMinor"`
	HelpText        string       `json:"helpText"`
	ContactURL      string       `json:"contactUrl"`
	Checkin         checkinState `json:"checkin"`
}

func validCreditContact(text, link string) bool {
	if utf8.RuneCountInString(text) > 500 || len(link) > 500 || strings.ContainsAny(link, "\r\n\t") {
		return false
	}
	if link == "" {
		return true
	}
	u, err := url.Parse(link)
	if err != nil || u.User != nil {
		return false
	}
	if u.Scheme == "mailto" {
		address, err := mail.ParseAddress(u.Opaque)
		return err == nil && address.Address == u.Opaque && u.RawQuery == "" && u.Fragment == ""
	}
	return (u.Scheme == "https" || u.Scheme == "http") && u.Hostname() != "" && u.Opaque == ""
}

type checkinReader interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// The database supplies one calendar day after locks are acquired. Client clocks,
// process timezones and time spent waiting on a concurrent claim cannot choose it.
func readCheckinState(ctx context.Context, db checkinReader, c operationSettings, uid string) (checkinState, error) {
	state := checkinState{Enabled: c.CheckinEnabled && c.CheckinRewardMinor > 0, RewardMinor: c.CheckinRewardMinor}
	var used int64
	err := db.QueryRowContext(ctx, `WITH calendar AS (
 SELECT (statement_timestamp() AT TIME ZONE 'Asia/Shanghai')::date AS day
 ) SELECT day::text, ((day+1)::timestamp AT TIME ZONE 'Asia/Shanghai'),
 ceil(EXTRACT(EPOCH FROM (((day+1)::timestamp AT TIME ZONE 'Asia/Shanghai')-statement_timestamp())))::integer,
 COALESCE((SELECT reward_minor FROM daily_checkins WHERE user_id=$1 AND claim_day=day),0),
 COALESCE((SELECT sum(reward_minor) FROM daily_checkins WHERE claim_day=day),0)
 FROM calendar`, uid).Scan(&state.Date, &state.NextClaimAt, &state.RefreshAfterSeconds, &state.ClaimedRewardMinor, &used)
	if err != nil {
		return state, err
	}
	state.Claimed = state.ClaimedRewardMinor > 0
	state.CanClaim = state.Enabled && !state.Claimed && used <= c.CheckinDailyBudgetMinor-c.CheckinRewardMinor
	if state.Enabled && !state.Claimed && !state.CanClaim {
		state.UnavailableReason = "今日签到奖励额度已用完，请明天再试"
	}
	return state, nil
}

func (s *Service) accountCheckin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	u, ok := s.currentUser(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return
	}
	if s.db == nil {
		s.error(w, 503, "CHECKIN_UNAVAILABLE", "签到暂时不可用，请稍后重试")
		return
	}
	if r.Method == http.MethodGet {
		c, err := s.operationSettings()
		var state checkinState
		if err == nil {
			state, err = readCheckinState(r.Context(), s.db, c, u.ID)
		}
		if err != nil {
			s.operationFailure(w, err)
			return
		}
		s.json(w, 200, state)
		return
	}
	state, available, held, err := s.claimCheckin(r.Context(), u.ID)
	if err != nil {
		s.operationFailure(w, err)
		return
	}
	s.json(w, 200, map[string]any{"checkin": state, "availableMinor": available, "heldMinor": held})
}

func (s *Service) claimCheckin(ctx context.Context, uid string) (state checkinState, available, held int64, err error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return state, 0, 0, err
	}
	defer tx.Rollback()
	var raw []byte
	if err = tx.QueryRowContext(ctx, "SELECT config FROM operation_settings WHERE id=true FOR SHARE").Scan(&raw); err != nil {
		return state, 0, 0, err
	}
	c := defaultOperationSettings()
	if err = json.Unmarshal(raw, &c); err != nil {
		return state, 0, 0, err
	}
	var status string
	if err = tx.QueryRowContext(ctx, "SELECT status FROM users WHERE id=$1 FOR UPDATE", uid).Scan(&status); err != nil {
		return state, 0, 0, err
	}
	if status != "active" {
		return state, 0, 0, &operationError{403, "ACCOUNT_DISABLED", "账号已停用"}
	}
	if err = tx.QueryRowContext(ctx, "SELECT available,held FROM credit_accounts WHERE user_id=$1 FOR UPDATE", uid).Scan(&available, &held); err != nil {
		return state, 0, 0, err
	}
	// Serializes the daily budget across users and API processes. The per-user row
	// and unique calendar key also prevent duplicate awards after retries.
	if _, err = tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock(724091031)"); err != nil {
		return state, 0, 0, err
	}
	if state, err = readCheckinState(ctx, tx, c, uid); err != nil {
		return state, 0, 0, err
	}
	if state.Claimed {
		return state, available, held, tx.Commit()
	}
	if !state.Enabled {
		return state, 0, 0, &operationError{409, "CHECKIN_CLOSED", "签到奖励暂未开放"}
	}
	if !state.CanClaim {
		return state, 0, 0, &operationError{429, "CHECKIN_BUDGET_EXHAUSTED", state.UnavailableReason}
	}
	if available > maxCreditMinor-c.CheckinRewardMinor {
		return state, 0, 0, &operationError{409, "CREDIT_BALANCE_LIMIT", "账户积分已达上限，请联系管理员"}
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO daily_checkins(user_id,claim_day,reward_minor) VALUES($1,$2::date,$3)", uid, state.Date, c.CheckinRewardMinor); err != nil {
		return state, 0, 0, err
	}
	available += c.CheckinRewardMinor
	if _, err = tx.ExecContext(ctx, "UPDATE credit_accounts SET available=$2,updated_at=now() WHERE user_id=$1", uid, available); err != nil {
		return state, 0, 0, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO credit_ledger(user_id,kind,available_delta,held_delta,available_after,held_after,request_key,note)
 VALUES($1,'checkin',$2,0,$3,$4,$5,'每日签到奖励')`, uid, c.CheckinRewardMinor, available, held, "checkin:"+state.Date); err != nil {
		return state, 0, 0, err
	}
	state.Claimed, state.ClaimedRewardMinor, state.CanClaim = true, c.CheckinRewardMinor, false
	return state, available, held, tx.Commit()
}
