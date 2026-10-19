// Package repository implements data access while leaving transaction ownership to callers.
package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"github.com/istudio/server/internal/domain"
)

const assetReferenceSQL = `(COALESCE(input->'productAssetIds','[]'::jsonb) ? $2 OR COALESCE(input->'referenceAssetIds','[]'::jsonb) ? $2 OR input->>'modelAssetId'=$2 OR input->>'sceneAssetId'=$2)`

func AssetReferences(q Queryer, uid, id, exceptTask string) (int, int, error) {
	var count, active int
	err := q.QueryRow(`SELECT count(*),count(*) FILTER (WHERE status IN ('queued','processing','waiting_provider')) FROM generation_tasks WHERE user_id=$1 AND `+assetReferenceSQL+` AND id<>$3`, uid, id, exceptTask).Scan(&count, &active)
	return count, active, err
}

func AssetReferencePredicate(idColumn string) string {
	return strings.ReplaceAll(assetReferenceSQL, "$2", idColumn)
}

func UserByUsername(db *sql.DB, username string) (domain.User, bool, error) {
	var u domain.User
	err := db.QueryRow("SELECT id, username, password_hash, role, status, auth_version FROM users WHERE username = $1", username).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.Status, &u.AuthVersion)
	if err == sql.ErrNoRows {
		return domain.User{}, false, nil
	}
	return u, err == nil, err
}

func NullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func TaskByID(db *sql.DB, id, userID string) (domain.GenerationTask, bool, error) {
	var t domain.GenerationTask
	var input []byte
	var resultRaw []byte
	var errorMessage sql.NullString
	var projectID sql.NullString
	var modulesRaw []byte
	err := db.QueryRow("SELECT id, project_id, status, created_at, input, result_images, result_modules, error_message FROM generation_tasks WHERE id = $1 AND user_id = $2", id, userID).Scan(&t.ID, &projectID, &t.Status, &t.CreatedAt, &input, &resultRaw, &modulesRaw, &errorMessage)
	t.ProjectID = projectID.String
	if err == sql.ErrNoRows {
		return domain.GenerationTask{}, false, nil
	}
	if err != nil {
		return domain.GenerationTask{}, false, err
	}
	if err := json.Unmarshal(input, &t.Input); err != nil {
		return domain.GenerationTask{}, false, err
	}
	_ = json.Unmarshal(resultRaw, &t.ResultImages)
	_ = json.Unmarshal(modulesRaw, &t.ResultModules)
	t.ErrorMessage = errorMessage.String
	return t, true, nil
}

// sqlQueryer 让删除逻辑既能跑在连接池上，也能跑在事务里（测试用事务回滚，不污染数据）。
type Queryer interface {
	Exec(query string, args ...any) (sql.Result, error)
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
}

var ErrTaskActive = errors.New("task is still generating")

// deleteTaskRecords 删除一条生成任务；返回该任务生成图片对应的存储 key（由调用方删除文件）。
// 任务本身不保留，结果图对应的资产记录一并清理，避免资产库留下孤儿数据。
func DeleteTask(q Queryer, userID, taskID string) ([]string, error) {
	if _, err := q.Exec("SELECT id FROM users WHERE id=$1 FOR UPDATE", userID); err != nil {
		return nil, err
	}
	var status string
	if err := q.QueryRow("SELECT status FROM generation_tasks WHERE id=$1 AND user_id=$2 FOR UPDATE", taskID, userID).Scan(&status); err != nil {
		return nil, err
	}
	if domain.IsActiveTask(status) {
		return nil, ErrTaskActive
	}
	rows, err := q.Query("SELECT id FROM assets WHERE user_id=$1 AND task_id=$2 ORDER BY id", userID, taskID)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	keys := []string{}
	for _, id := range ids {
		key, err := DeleteAssetExcept(q, userID, id, taskID)
		if err != nil {
			return nil, err
		}
		if key != "" {
			keys = append(keys, key)
		}
	}
	result, err := q.Exec("DELETE FROM generation_tasks WHERE id=$1 AND user_id=$2", taskID, userID)
	if err != nil {
		return nil, err
	}
	if affected, err := result.RowsAffected(); err == nil && affected == 0 {
		return nil, sql.ErrNoRows
	}

	return keys, nil
}

// deleteAssetRecord 删除一张资产，并从所属任务的结果里移除它，避免历史记录出现打不开的缩略图。
func DeleteAsset(q Queryer, userID, assetID string) (string, error) {
	return DeleteAssetExcept(q, userID, assetID, "")
}

func DeleteAssetExcept(q Queryer, userID, assetID, exceptTask string) (string, error) {
	if _, err := q.Exec("SELECT id FROM users WHERE id=$1 FOR UPDATE", userID); err != nil {
		return "", err
	}
	var key string
	if err := q.QueryRow("SELECT storage_key FROM assets WHERE id=$1 AND user_id=$2 FOR UPDATE", assetID, userID).Scan(&key); err != nil {
		return "", err
	}
	references, active, err := AssetReferences(q, userID, assetID, exceptTask)
	if err != nil {
		return "", err
	}
	if active > 0 {
		return "", ErrTaskActive
	}
	if references > 0 {
		if _, err = q.Exec("UPDATE assets SET hidden_at=COALESCE(hidden_at,now()) WHERE id=$1 AND user_id=$2", assetID, userID); err != nil {
			return "", err
		}
		key = "" // Keep bytes required to restore historical inputs.
	} else if _, err = q.Exec("DELETE FROM assets WHERE id=$1 AND user_id=$2", assetID, userID); err != nil {
		return "", err
	}

	path := "/v1/assets/" + assetID + "/content"
	// 两个数组按同一个原始位置过滤，删除中间一张后模块归属仍与图片逐项对应。
	if _, err := q.Exec(`UPDATE generation_tasks t SET
		result_images=COALESCE((SELECT jsonb_agg(image.value ORDER BY image.position)
			FROM jsonb_array_elements(t.result_images) WITH ORDINALITY AS image(value,position)
			WHERE image.value<>to_jsonb($1::text)), '[]'::jsonb),
		result_modules=CASE WHEN jsonb_typeof(t.result_modules)<>'array' OR t.result_modules='[]'::jsonb THEN '[]'::jsonb ELSE
			COALESCE((SELECT jsonb_agg(COALESCE(t.result_modules->((image.position-1)::int),'""'::jsonb) ORDER BY image.position)
				FROM jsonb_array_elements(t.result_images) WITH ORDINALITY AS image(value,position)
				WHERE image.value<>to_jsonb($1::text)), '[]'::jsonb) END
		WHERE t.user_id=$2 AND t.result_images ? $1`, path, userID); err != nil {
		return key, err
	}
	if key != "" {
		if _, err := q.Exec("INSERT INTO storage_deletions(storage_key) VALUES($1) ON CONFLICT DO NOTHING", key); err != nil {
			return "", err
		}
	}

	return key, nil
}
