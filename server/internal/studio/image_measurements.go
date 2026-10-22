package studio

import (
	"bytes"
	"database/sql"
	"image"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/istudio/server/internal/domain"
	"github.com/istudio/server/internal/idgen"
)

const maxSupplierCostMicros int64 = 1000000000000

type imageMeasurement struct {
	ID                  string    `json:"id"`
	EndpointID          string    `json:"endpointId"`
	Model               string    `json:"model"`
	AspectRatio         string    `json:"aspectRatio"`
	Resolution          string    `json:"resolution"`
	Width               int       `json:"width"`
	Height              int       `json:"height"`
	SizeBytes           int64     `json:"sizeBytes"`
	ElapsedMS           int64     `json:"elapsedMs"`
	Success             bool      `json:"success"`
	ErrorMessage        string    `json:"errorMessage"`
	EstimatedCostMicros *int64    `json:"estimatedCostMicros"`
	ActualCostMicros    *int64    `json:"actualCostMicros"`
	Currency            string    `json:"currency"`
	CostNote            string    `json:"costNote"`
	CreatedAt           time.Time `json:"createdAt"`
}

const measurementColumns = `id,endpoint_id,upstream_model_id,aspect_ratio,resolution,width,height,size_bytes,elapsed_ms,success,error_message,estimated_cost_micros,actual_cost_micros,currency,cost_note,created_at`

func scanMeasurement(row interface{ Scan(...any) error }) (imageMeasurement, error) {
	var m imageMeasurement
	err := row.Scan(&m.ID, &m.EndpointID, &m.Model, &m.AspectRatio, &m.Resolution, &m.Width, &m.Height, &m.SizeBytes, &m.ElapsedMS, &m.Success, &m.ErrorMessage, &m.EstimatedCostMicros, &m.ActualCostMicros, &m.Currency, &m.CostNote, &m.CreatedAt)
	return m, err
}

func (s *Service) recordImageMeasurement(r *http.Request, m imageMeasurement) (imageMeasurement, error) {
	if s.db == nil {
		return m, nil
	}
	actor, _ := s.currentAdministrator(r)
	m.ID = idgen.New()
	return scanMeasurement(s.db.QueryRow(`INSERT INTO ai_image_measurements(id,endpoint_id,upstream_model_id,aspect_ratio,resolution,width,height,size_bytes,elapsed_ms,success,error_message,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING `+measurementColumns, m.ID, m.EndpointID, m.Model, m.AspectRatio, m.Resolution, m.Width, m.Height, m.SizeBytes, m.ElapsedMS, m.Success, m.ErrorMessage, actor.ID))
}

func (s *Service) adminImageMeasurements(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method == http.MethodGet && id == "" {
		endpoint, model := r.URL.Query().Get("endpointId"), r.URL.Query().Get("model")
		if endpoint == "" || len(model) > 200 {
			s.error(w, 400, "MEASUREMENT_FILTER_REQUIRED", "请选择通道和模型")
			return
		}
		rows, err := s.db.Query(`SELECT `+measurementColumns+` FROM ai_image_measurements WHERE endpoint_id=$1 AND ($2='' OR upstream_model_id=$2) ORDER BY created_at DESC,id DESC LIMIT 30`, endpoint, model)
		if err != nil {
			s.error(w, 503, "MEASUREMENTS_UNAVAILABLE", "核验记录暂时不可用")
			return
		}
		defer rows.Close()
		items := []imageMeasurement{}
		for rows.Next() {
			m, err := scanMeasurement(rows)
			if err != nil {
				s.error(w, 503, "MEASUREMENTS_UNAVAILABLE", "核验记录读取失败")
				return
			}
			items = append(items, m)
		}
		if rows.Err() != nil {
			s.error(w, 503, "MEASUREMENTS_UNAVAILABLE", "核验记录读取失败")
			return
		}
		s.json(w, 200, map[string]any{"measurements": items})
		return
	}
	if r.Method != http.MethodPut || id == "" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	var input struct {
		EstimatedCostMicros *int64 `json:"estimatedCostMicros"`
		ActualCostMicros    *int64 `json:"actualCostMicros"`
		Currency            string `json:"currency"`
		CostNote            string `json:"costNote"`
	}
	if !decode(r, &input) || !regexp.MustCompile(`^[A-Z]{3}$`).MatchString(input.Currency) || len([]rune(input.CostNote)) > 500 || (input.ActualCostMicros != nil && (*input.ActualCostMicros < 0 || *input.ActualCostMicros > maxSupplierCostMicros)) || (input.EstimatedCostMicros != nil && (*input.EstimatedCostMicros < 0 || *input.EstimatedCostMicros > maxSupplierCostMicros)) {
		s.error(w, 400, "MEASUREMENT_COST_INVALID", "费用需为有效非负金额，币种为三位大写代码；未知费用请留空")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.error(w, 503, "MEASUREMENTS_UNAVAILABLE", "费用记录保存失败")
		return
	}
	defer tx.Rollback()
	m, err := scanMeasurement(tx.QueryRow(`UPDATE ai_image_measurements SET estimated_cost_micros=$2,actual_cost_micros=$3,currency=$4,cost_note=$5,updated_at=now() WHERE id=$1 RETURNING `+measurementColumns, id, input.EstimatedCostMicros, input.ActualCostMicros, input.Currency, strings.TrimSpace(input.CostNote)))
	if err == sql.ErrNoRows {
		s.error(w, 404, "MEASUREMENT_NOT_FOUND", "核验记录不存在")
		return
	}
	if err == nil {
		actor, _ := s.currentAdministrator(r)
		_, err = tx.Exec("INSERT INTO admin_audit(actor_id,action,target_id,detail) VALUES($1,'measurement.cost.update',$2,'更新独立的供应商费用记录，未修改用户积分或模型价格')", actor.ID, id)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.error(w, 503, "MEASUREMENTS_UNAVAILABLE", "费用记录保存失败")
		return
	}
	s.json(w, 200, m)
}

func (s *Service) attachImageDetails(t *domain.GenerationTask) {
	if s.db == nil || len(t.ResultImages) == 0 {
		return
	}
	rows, err := s.db.Query(`SELECT '/v1/assets/'||a.id||'/content',a.width,a.height,a.size_bytes,d.elapsed_ms FROM assets a LEFT JOIN generation_deliveries d ON d.task_id=a.task_id AND d.asset_id=a.id WHERE a.task_id=$1 AND a.user_id=$2 ORDER BY a.created_at,a.id`, t.ID, t.UserID)
	if err != nil {
		return
	}
	defer rows.Close()
	details := []domain.GenerationImageDetail{}
	for rows.Next() {
		var detail domain.GenerationImageDetail
		if rows.Scan(&detail.ContentPath, &detail.Width, &detail.Height, &detail.SizeBytes, &detail.ElapsedMS) != nil {
			return
		}
		details = append(details, detail)
	}
	if rows.Err() == nil {
		t.ResultDetails = details
	}
}

func actualImageDimensions(source string) (int, int, int64, error) {
	data, _, err := readGeneratedImage(generatedImageClient, source)
	if err != nil {
		return 0, 0, 0, err
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	return config.Width, config.Height, int64(len(data)), err
}
