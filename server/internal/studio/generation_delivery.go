package studio

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"time"

	"github.com/istudio/server/internal/idgen"
)

var errGenerationLeaseLost = errors.New("generation worker lease lost")

type generationRun struct {
	server *Service
	id     string
	token  string
}

type generationDelivery struct {
	status, providerID, encryptedSource, assetID, message string
}

// Locking the task fences result writes and settlement against an old worker
// whose lease expired while its upstream request was still running.
func (run *generationRun) lock(ctx context.Context, tx *sql.Tx) error {
	var valid bool
	err := tx.QueryRowContext(ctx, `SELECT COALESCE(lease_token=$2 AND lease_until>now() AND status IN ('processing','waiting_provider'),false) FROM generation_tasks WHERE id=$1 FOR UPDATE`, run.id, run.token).Scan(&valid)
	if err == sql.ErrNoRows || err == nil && !valid {
		return errGenerationLeaseLost
	}
	return err
}

func (run *generationRun) begin(ctx context.Context, position int, requestKey, module string) (generationDelivery, bool, error) {
	tx, err := run.server.db.BeginTx(ctx, nil)
	if err != nil {
		return generationDelivery{}, false, err
	}
	defer tx.Rollback()
	if err = run.lock(ctx, tx); err != nil {
		return generationDelivery{}, false, err
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO generation_deliveries(task_id,position,request_key,module_key,status) VALUES($1,$2,$3,$4,'submitting') ON CONFLICT(task_id,position) DO NOTHING`, run.id, position, requestKey, module)
	if err != nil {
		return generationDelivery{}, false, err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return generationDelivery{}, false, err
	}
	var delivery generationDelivery
	var storedKey, storedModule string
	err = tx.QueryRowContext(ctx, `SELECT status,provider_task_id,result_source_encrypted,COALESCE(asset_id,''),error_message,request_key,module_key FROM generation_deliveries WHERE task_id=$1 AND position=$2`, run.id, position).Scan(&delivery.status, &delivery.providerID, &delivery.encryptedSource, &delivery.assetID, &delivery.message, &storedKey, &storedModule)
	if err != nil {
		return delivery, false, err
	}
	if storedKey != requestKey || storedModule != module {
		return delivery, false, fmt.Errorf("逐张生成规划与已保存任务不一致")
	}
	return delivery, n == 1, tx.Commit()
}

func (run *generationRun) update(ctx context.Context, position int, status, providerID, source, message string, elapsed ...int64) error {
	tx, err := run.server.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = run.lock(ctx, tx); err != nil {
		return err
	}
	var elapsedMS *int64
	if len(elapsed) > 0 {
		elapsedMS = &elapsed[0]
	}
	_, err = tx.ExecContext(ctx, `UPDATE generation_deliveries SET status=$3,provider_task_id=$4,result_source_encrypted=$5,error_message=$6,elapsed_ms=COALESCE($7,elapsed_ms),updated_at=now() WHERE task_id=$1 AND position=$2 AND status<>'saved'`, run.id, position, status, providerID, source, message, elapsedMS)
	if err == nil {
		taskStatus := "processing"
		if status == "waiting_provider" {
			taskStatus = "waiting_provider"
		}
		_, err = tx.ExecContext(ctx, `UPDATE generation_tasks SET status=$2 WHERE id=$1`, run.id, taskStatus)
	}
	if err == nil {
		err = tx.Commit()
	}
	return err
}

func deliveryEncryptionID(taskID string, position int) string {
	return fmt.Sprintf("generation-delivery:%s:%d", taskID, position)
}

// The recoverable source may contain a signed URL or inline image. Encrypt it
// with the existing application key and clear it after delivery or settlement.
func (run *generationRun) keepSource(ctx context.Context, position int, providerID, source string, elapsed ...int64) (string, error) {
	encrypted, err := run.server.ai.encrypt(deliveryEncryptionID(run.id, position), source)
	if err != nil {
		return "", err
	}
	if err = run.update(ctx, position, "saving", providerID, encrypted, "", elapsed...); err != nil {
		return "", err
	}
	return encrypted, nil
}

func (run *generationRun) save(ctx context.Context, position int, encrypted string) (string, error) {
	s := run.server
	source, err := s.ai.decryptValue(deliveryEncryptionID(run.id, position), encrypted)
	if err != nil {
		return "", err
	}
	data, mime, err := readGeneratedImage(generatedImageClient, source)
	if err != nil {
		return "", fmt.Errorf("生成图片保存失败: %w", err)
	}
	ext := extensionForMime(mime)
	assetID := idgen.New()
	key := s.newStorageKey(generatedImageStorageKey(time.Now().In(generationStorageLocation), idgen.New(), ext))
	if err = s.storage.Save(key, bytes.NewReader(data)); err != nil {
		return "", fmt.Errorf("生成图片保存失败: %w", err)
	}
	keepFile := false
	defer func() {
		if !keepFile {
			_ = s.storage.Delete(key)
		}
	}()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	if err = run.lock(ctx, tx); err != nil {
		return "", err
	}
	var existing sql.NullString
	if err = tx.QueryRowContext(ctx, "SELECT asset_id FROM generation_deliveries WHERE task_id=$1 AND position=$2", run.id, position).Scan(&existing); err != nil {
		return "", err
	}
	if existing.Valid {
		return "/v1/assets/" + existing.String + "/content", nil
	}
	var uid string
	var projectID sql.NullString
	if err = tx.QueryRowContext(ctx, "SELECT user_id,project_id FROM generation_tasks WHERE id=$1", run.id).Scan(&uid, &projectID); err != nil {
		return "", err
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	if err = s.ensureStorageCapacity(ctx, tx, uid, int64(len(data))); err != nil {
		return "", err
	}
	hash := sha256.Sum256(data)
	filename := fmt.Sprintf("generated-%.8s-%02d%s", run.id, position, ext)
	_, err = tx.ExecContext(ctx, `INSERT INTO assets(id,user_id,project_id,task_id,filename,storage_key,mime,size_bytes,width,height,hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, assetID, uid, projectID, run.id, filename, key, mime, len(data), config.Width, config.Height, hex.EncodeToString(hash[:]))
	if err != nil {
		return "", err
	}
	_, err = tx.ExecContext(ctx, `UPDATE generation_deliveries SET status='saved',asset_id=$3,result_source_encrypted='',error_message='',updated_at=now() WHERE task_id=$1 AND position=$2`, run.id, position, assetID)
	if err != nil {
		return "", err
	}
	paths, modules, err := savedDeliveryImages(ctx, tx, run.id)
	if err != nil {
		return "", err
	}
	raw, _ := json.Marshal(paths)
	mods, _ := json.Marshal(modules)
	if _, err = tx.ExecContext(ctx, "UPDATE generation_tasks SET result_images=$2::jsonb,result_modules=$3::jsonb WHERE id=$1", run.id, raw, mods); err != nil {
		return "", err
	}
	// An uncertain COMMIT must never delete an image that may now be published.
	keepFile = true
	if err = tx.Commit(); err != nil {
		return "", err
	}
	return "/v1/assets/" + assetID + "/content", nil
}

func savedDeliveryImages(ctx context.Context, tx *sql.Tx, id string) ([]string, []string, error) {
	rows, err := tx.QueryContext(ctx, `SELECT '/v1/assets/'||a.id||'/content',d.module_key FROM generation_deliveries d JOIN assets a ON a.id=d.asset_id AND a.task_id=d.task_id WHERE d.task_id=$1 AND d.status='saved' ORDER BY d.position`, id)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	paths, modules := []string{}, []string{}
	for rows.Next() {
		var path, module string
		if err = rows.Scan(&path, &module); err != nil {
			return nil, nil, err
		}
		paths = append(paths, path)
		modules = append(modules, module)
	}
	return paths, modules, rows.Err()
}

// Poll is part of the legacy worker interface, so recovery requires an explicit
// capability declaration. Current configured protocols are synchronous.
type recoverableImageProvider interface {
	SupportsTaskRecovery() bool
}

func (q *taskQueue) generateImage(ctx context.Context, id string, input map[string]any, position int, module string, run *generationRun) (string, error) {
	client := q.imageClient(input)
	delivery, fresh := generationDelivery{}, true
	if run != nil {
		var err error
		delivery, fresh, err = run.begin(ctx, position, stringValue(input["taskId"], ""), module)
		if err != nil {
			return "", err
		}
		if delivery.status == "saved" && delivery.assetID != "" {
			return "/v1/assets/" + delivery.assetID + "/content", nil
		}
		if delivery.status == "saving" && delivery.encryptedSource != "" {
			return run.save(ctx, position, delivery.encryptedSource)
		}
		if !fresh {
			capability, supported := client.(recoverableImageProvider)
			if delivery.status != "waiting_provider" || delivery.providerID == "" || !supported || !capability.SupportsTaskRecovery() {
				return "", fmt.Errorf("上次生成被中断，当前同步服务无法重新查询未交付结果；已保存图片保留，剩余积分退回。重新生成会创建新任务并计费")
			}
		}
	}
	started := time.Now()
	remote := providerTask{ID: delivery.providerID}
	if fresh {
		if run == nil {
			q.server.updateTaskStatus(id, "processing")
		}
		var err error
		remote, err = client.Submit(ctx, input)
		if err != nil {
			return "", err
		}
	}
	images := remote.Images
	if len(images) == 0 {
		if remote.ID == "" {
			return "", fmt.Errorf("供应商未返回图片或可查询的任务编号")
		}
		if run != nil {
			if err := run.update(ctx, position, "waiting_provider", remote.ID, "", ""); err != nil {
				return "", err
			}
		} else {
			q.server.updateTaskStatus(id, "waiting_provider")
		}
		var err error
		images, err = q.waitForImagesContext(ctx, id, remote.ID, client)
		if err != nil {
			return "", err
		}
	}
	if len(images) != 1 {
		return "", fmt.Errorf("预期一张图片，供应商实际返回 %d 张", len(images))
	}
	if run == nil {
		return images[0], nil
	}
	encrypted, err := run.keepSource(ctx, position, remote.ID, images[0], time.Since(started).Milliseconds())
	if err != nil {
		return "", err
	}
	return run.save(ctx, position, encrypted)
}
