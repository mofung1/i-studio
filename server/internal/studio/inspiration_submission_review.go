package studio

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/istudio/server/internal/repository"
)

type submissionReview struct {
	Version     int    `json:"version"`
	Decision    string `json:"decision"`
	CategoryID  string `json:"categoryId"`
	Reason      string `json:"reason"`
	GrantReward bool   `json:"grantReward"`
	RewardMinor int64  `json:"rewardMinor"`
}

func (s *Service) adminInspirationSubmissionByID(w http.ResponseWriter, r *http.Request, id, action string) {
	if !s.requireAdmin(w, r) {
		return
	}
	if s.db == nil {
		s.error(w, 503, "DATABASE_REQUIRED", "投稿需要连接数据库")
		return
	}
	if action == "cover" {
		s.serveSubmissionCover(w, r, id, "", true)
		return
	}
	if action == "review" {
		s.reviewInspirationSubmission(w, r, id)
		return
	}
	if action == "unpublish" {
		s.withdrawInspirationSubmission(w, r, id, "")
		return
	}
	s.writeInspirationSubmission(w, r, id, "", true)
}

func (s *Service) reviewInspirationSubmission(w http.ResponseWriter, r *http.Request, id string) {
	actor, ok := s.currentAdministrator(r)
	if !ok {
		return
	}
	var input submissionReview
	if !decode(r, &input) || input.Version < 1 {
		s.error(w, 400, "REVIEW_INVALID", "审核参数不正确")
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Decision == "reject" {
		input.CategoryID = ""
	}
	if (input.Decision != "approve" && input.Decision != "reject") || len([]rune(input.Reason)) > 500 || (input.Decision == "reject" && input.Reason == "") ||
		(input.GrantReward && (input.Decision != "approve" || input.RewardMinor <= 0 || input.RewardMinor > 100000000 || input.RewardMinor%creditScale != 0)) || (!input.GrantReward && input.RewardMinor != 0) {
		s.error(w, 400, "REVIEW_INVALID", "退回需填写原因；积分奖励需为 1–1000000 的整数，并且只能在审核通过时发放")
		return
	}
	raw, _ := json.Marshal(input)
	reviewHash := digestSubmission(append(raw, []byte(actor.ID)...))
	tx, err := repository.BeginInspirationEdit(s.db)
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	defer tx.Rollback()
	var uid, publicationID string
	var version int
	var reward int64
	err = tx.QueryRowContext(r.Context(), "SELECT user_id,publication_id,current_version,reward_minor FROM inspiration_submissions WHERE id=$1 FOR UPDATE", id).Scan(&uid, &publicationID, &version, &reward)
	if errors.Is(err, sql.ErrNoRows) {
		s.error(w, 404, "SUBMISSION_NOT_FOUND", "投稿不存在")
		return
	}
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	if version != input.Version {
		s.submissionFailure(w, submissionConflict())
		return
	}
	var title, prompt, instructions, status, oldReviewHash, privateKey, publicKey string
	var requiresReference bool
	var width, height int
	var coverBytes int64
	err = tx.QueryRowContext(r.Context(), `SELECT title,prompt,instructions,requires_reference,status,review_hash,cover_key,public_key,width,height,cover_bytes FROM inspiration_submission_revisions WHERE submission_id=$1 AND version=$2`, id, version).
		Scan(&title, &prompt, &instructions, &requiresReference, &status, &oldReviewHash, &privateKey, &publicKey, &width, &height, &coverBytes)
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	if status != "pending" {
		if oldReviewHash == reviewHash {
			_ = tx.Rollback()
			s.writeInspirationSubmission(w, r, id, "", true)
			return
		}
		s.submissionFailure(w, submissionConflict())
		return
	}
	if input.GrantReward && reward > 0 {
		s.error(w, 409, "SUBMISSION_ALREADY_REWARDED", "该投稿已获得奖励，修改或重新发布不会重复奖励")
		return
	}
	if err = lockSubmissionOwner(r.Context(), tx, uid); err != nil {
		s.submissionFailure(w, err)
		return
	}
	category := ""
	if input.Decision == "approve" {
		if err = tx.QueryRowContext(r.Context(), "SELECT name FROM inspiration_categories WHERE id=$1", input.CategoryID).Scan(&category); errors.Is(err, sql.ErrNoRows) {
			s.error(w, 400, "SUBMISSION_CATEGORY_INVALID", "请选择有效分类")
			return
		} else if err != nil {
			s.submissionFailure(w, err)
			return
		}
		if err = s.ensureStorageCapacity(r.Context(), tx, uid, coverBytes); err != nil {
			s.submissionFailure(w, err)
			return
		}
		file, e := s.storage.Open(privateKey)
		if e != nil {
			s.submissionFailure(w, e)
			return
		}
		data, e := io.ReadAll(io.LimitReader(file, coverBytes+1))
		_ = file.Close()
		if e != nil || int64(len(data)) != coverBytes {
			s.error(w, 409, "SUBMISSION_COVER_MISSING", "投稿封面不完整，请退回用户重新提交")
			return
		}
		publicKey = s.newStorageKey("inspiration/community/" + id + "-v" + strconv.Itoa(version) + ".jpg")
		defer func() { _ = tx.Rollback(); s.removeUnusedSubmissionFile(publicKey) }()
		if err = s.storage.Save(publicKey, bytes.NewReader(data)); err != nil {
			s.submissionFailure(w, err)
			return
		}
		_, err = tx.ExecContext(r.Context(), `INSERT INTO inspiration_prompts(id,title,category,prompt,source,image_key,image_width,image_height,enabled,submission_id,instructions,requires_reference)
   VALUES($1,$2,$3,$4,'用户投稿',$5,$6,$7,true,$8,$9,$10)
   ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,category=EXCLUDED.category,prompt=EXCLUDED.prompt,image_key=EXCLUDED.image_key,image_width=EXCLUDED.image_width,image_height=EXCLUDED.image_height,enabled=true,instructions=EXCLUDED.instructions,requires_reference=EXCLUDED.requires_reference`, publicationID, title, category, prompt, publicKey, width, height, id, instructions, requiresReference)
		if err == nil {
			_, err = tx.ExecContext(r.Context(), "UPDATE inspiration_submissions SET published_version=$2,updated_at=now() WHERE id=$1", id, version)
		}
	}
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	granted := int64(0)
	if input.GrantReward {
		granted = input.RewardMinor
		var available, held int64
		err = tx.QueryRowContext(r.Context(), "SELECT available,held FROM credit_accounts WHERE user_id=$1 FOR UPDATE", uid).Scan(&available, &held)
		if err != nil {
			s.submissionFailure(w, err)
			return
		}
		if available > maxCreditMinor-granted {
			s.error(w, 409, "BALANCE_INVALID", "用户余额将超过上限，请调整奖励数量")
			return
		}
		_, err = tx.ExecContext(r.Context(), "UPDATE credit_accounts SET available=available+$2,updated_at=now() WHERE user_id=$1", uid, granted)
		if err == nil {
			_, err = tx.ExecContext(r.Context(), `INSERT INTO credit_ledger(user_id,kind,available_delta,held_delta,available_after,held_after,request_key,note,actor_id) VALUES($1,'inspiration_reward',$2,0,$3,$4,$5,$6,$7)`, uid, granted, available+granted, held, "inspiration-reward:"+id, "提示词投稿通过："+title, actor.ID)
		}
		if err == nil {
			_, err = tx.ExecContext(r.Context(), "UPDATE inspiration_submissions SET reward_minor=$2,rewarded_at=now() WHERE id=$1", id, granted)
		}
	}
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	status = "rejected"
	if input.Decision == "approve" {
		status = "approved"
	}
	_, err = tx.ExecContext(r.Context(), `UPDATE inspiration_submission_revisions SET status=$3,review_reason=$4,reviewer_id=$5,reviewed_at=now(),review_hash=$6,review_reward_minor=$7,public_key=$8,storage_bytes=cover_bytes+CASE WHEN $8='' THEN 0 ELSE cover_bytes END,category_id=COALESCE(NULLIF($9,''),category_id),category=CASE WHEN $10='' THEN category ELSE $10 END WHERE submission_id=$1 AND version=$2`, id, version, status, input.Reason, actor.ID, reviewHash, granted, publicKey, input.CategoryID, category)
	if err == nil {
		_, err = tx.ExecContext(r.Context(), "INSERT INTO admin_audit(actor_id,action,target_id,detail) VALUES($1,$2,$3,$4)", actor.ID, "inspiration."+input.Decision, id, fmt.Sprintf("版本 %d；奖励 %s；%s", version, formatCredits(granted), input.Reason))
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	s.writeInspirationSubmission(w, r, id, "", true)
}

func (s *Service) withdrawInspirationSubmission(w http.ResponseWriter, r *http.Request, id, uid string) {
	var input struct {
		Version int    `json:"version"`
		Reason  string `json:"reason"`
	}
	if !decode(r, &input) || input.Version < 1 || len([]rune(input.Reason)) > 500 {
		s.error(w, 400, "SUBMISSION_INVALID", "请刷新投稿后重试")
		return
	}
	if uid == "" && strings.TrimSpace(input.Reason) == "" {
		s.error(w, 400, "SUBMISSION_INVALID", "请填写下架原因")
		return
	}
	tx, err := repository.BeginInspirationEdit(s.db)
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	defer tx.Rollback()
	var owner, publicationID string
	var version int
	err = tx.QueryRowContext(r.Context(), "SELECT user_id,publication_id,current_version FROM inspiration_submissions WHERE id=$1 FOR UPDATE", id).Scan(&owner, &publicationID, &version)
	if errors.Is(err, sql.ErrNoRows) || (uid != "" && uid != owner) {
		s.error(w, 404, "SUBMISSION_NOT_FOUND", "投稿不存在")
		return
	}
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	if version != input.Version {
		s.submissionFailure(w, submissionConflict())
		return
	}
	_, err = tx.ExecContext(r.Context(), "UPDATE inspiration_prompts SET enabled=false WHERE id=$1", publicationID)
	if err == nil {
		_, err = tx.ExecContext(r.Context(), "UPDATE inspiration_submission_revisions SET status='withdrawn' WHERE submission_id=$1 AND version=$2 AND status='pending'", id, version)
	}
	if err == nil {
		_, err = tx.ExecContext(r.Context(), "UPDATE inspiration_submissions SET updated_at=now() WHERE id=$1", id)
	}
	if err == nil && uid == "" {
		if actor, ok := s.currentAdministrator(r); ok {
			_, err = tx.ExecContext(r.Context(), "INSERT INTO admin_audit(actor_id,action,target_id,detail) VALUES($1,'inspiration.unpublish',$2,$3)", actor.ID, id, input.Reason)
		}
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	s.json(w, 200, map[string]bool{"saved": true})
}
