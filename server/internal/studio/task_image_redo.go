package studio

import (
	"context"
	"database/sql"
	"errors"
	"maps"
	"net/http"
	"slices"
	"strings"

	"github.com/istudio/server/internal/domain"
	"github.com/istudio/server/internal/repository"
)

func hasImageRedoMetadata(input map[string]any) bool {
	for _, key := range []string{"redoSourceTaskId", "redoSourceAssetId", "redoModelAssetId", "redoInstructions"} {
		if _, provided := input[key]; provided {
			return true
		}
	}
	return false
}

func (s *Service) redoTaskImage(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPost {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	uid, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return
	}
	if s.db == nil || s.provider == nil {
		s.error(w, 503, "AI_PROVIDER_UNAVAILABLE", "AI 服务暂时不可用")
		return
	}
	var request struct {
		AssetID      string `json:"assetId"`
		Requirements string `json:"requirements"`
	}
	if !decode(r, &request) {
		s.error(w, 400, "REDO_INPUT_INVALID", "请选择要重做的图片")
		return
	}
	assetID, instructions := strings.TrimSpace(request.AssetID), strings.TrimSpace(request.Requirements)
	if assetID == "" || len(assetID) > 200 || len([]rune(instructions)) > 1000 {
		s.error(w, 400, "REDO_INPUT_INVALID", "请选择要重做的图片，补充要求最多 1000 字")
		return
	}
	original, exists, err := repository.TaskByID(s.db, id, uid)
	if err != nil {
		s.error(w, 500, "TASK_STORAGE_ERROR", "任务查询失败")
		return
	}
	if !exists {
		s.error(w, 404, "GENERATION_TASK_NOT_FOUND", "生成任务不存在")
		return
	}
	if domain.IsActiveTask(original.Status) {
		s.error(w, 409, "REDO_SOURCE_ACTIVE", "请等待这套图片生成结束后再重做")
		return
	}
	input, err := s.prepareTaskImageRedo(r.Context(), original, assetID, instructions)
	if err != nil {
		var problem *operationError
		if errors.As(err, &problem) {
			s.operationFailure(w, err)
		} else {
			s.error(w, 500, "TASK_STORAGE_ERROR", "读取成片信息失败，请稍后重试")
		}
		return
	}
	s.createChargedTask(w, r, uid, input)
}

func (s *Service) prepareTaskImageRedo(ctx context.Context, original domain.GenerationTask, assetID, instructions string) (map[string]any, error) {
	source, _ := original.Input.(map[string]any)
	taskType := domain.TaskInputField(source, "taskType")
	generatedClothing := taskType == "clothing-set" && source["clothingModelSource"] == "generated"
	if source["mode"] != "commerce" || (!generatedClothing && taskType != "product-main" && taskType != "detail-page") {
		return nil, &operationError{400, "REDO_UNSUPPORTED", "这类图片暂不支持单张重做"}
	}
	if domain.TaskInputField(source, "endpointId") == "" {
		return nil, &operationError{409, "MODEL_UNAVAILABLE", "原任务的模型已不可用"}
	}
	index := slices.Index(original.ResultImages, "/v1/assets/"+assetID+"/content")
	if index < 0 {
		return nil, &operationError{404, "REDO_IMAGE_NOT_FOUND", "这条任务中没有这张成片"}
	}
	var position int
	var module string
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(d.position,0),COALESCE(d.module_key,'')
		FROM assets a
		LEFT JOIN generation_deliveries d ON d.task_id=a.task_id AND d.asset_id=a.id AND d.status='saved'
		WHERE a.id=$1 AND a.user_id=$2 AND a.task_id=$3`,
		assetID, original.UserID, original.ID).Scan(&position, &module)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, &operationError{404, "REDO_IMAGE_NOT_FOUND", "这条任务中没有这张成片"}
	}
	if err != nil {
		return nil, err
	}
	if module == "" && index < len(original.ResultModules) {
		module = original.ResultModules[index]
	}

	input := maps.Clone(source)
	if original.ProjectID != "" {
		input["projectId"] = original.ProjectID
	} else {
		delete(input, "projectId")
	}
	input["count"] = float64(1)
	input["redoSourceTaskId"] = original.ID
	input["redoSourceAssetId"] = assetID
	input["redoInstructions"] = instructions
	delete(input, "redoModelAssetId")
	if generatedClothing {
		shots, _ := source["clothingPlan"].([]any)
		// A complete legacy result list is still in plan order. If an image
		// was removed, only the saved delivery position can recover its angle.
		legacyOrder := position == 0 && len(shots) == len(original.ResultImages)
		if legacyOrder {
			position = index + 1
		}
		if position < 1 || position > len(shots) || module != "clothing-model" ||
			domain.TaskInputField(shots[position-1], "moduleKey") != module {
			return nil, &operationError{409, "REDO_SHOT_UNAVAILABLE", "无法确定这张服装图的拍摄角度"}
		}
		modelAssetID, err := s.redoClothingModelAsset(ctx, original, position, legacyOrder)
		if err != nil {
			return nil, err
		}
		if modelAssetID != "" {
			input["redoModelAssetId"] = modelAssetID
		}
		input["clothingPlan"] = []any{shots[position-1]}
	} else {
		if _, supported := allowedModules[taskType][module]; !supported {
			return nil, &operationError{409, "REDO_SHOT_UNAVAILABLE", "这张成片没有可重做的图种"}
		}
		input["moduleMode"] = "custom"
		input["moduleOrder"] = []any{module}
	}
	input["moduleCounts"] = map[string]any{module: float64(1)}
	if err := validateGenerationInput(input); err != nil {
		return nil, &operationError{400, "REDO_INPUT_INVALID", "原任务的生成参数无法用于单张重做"}
	}
	return input, nil
}

func (s *Service) redoClothingModelAsset(ctx context.Context, original domain.GenerationTask, position int, legacyOrder bool) (string, error) {
	if previousAnchor := domain.TaskInputField(original.Input, "redoModelAssetId"); previousAnchor != "" {
		return previousAnchor, nil
	}
	if position == 1 {
		return "", nil // The selected result already supplies the original front view.
	}
	var assetID string
	var err error
	if legacyOrder {
		err = s.db.QueryRowContext(ctx, `
			SELECT id FROM assets WHERE id=$1 AND task_id=$2 AND user_id=$3`,
			assetIDFromPath(original.ResultImages[0]), original.ID, original.UserID).Scan(&assetID)
	} else {
		err = s.db.QueryRowContext(ctx, `
			SELECT a.id FROM generation_deliveries d
			JOIN assets a ON a.id=d.asset_id AND a.task_id=d.task_id
			WHERE d.task_id=$1 AND a.user_id=$2 AND d.position=1 AND d.status='saved'`,
			original.ID, original.UserID).Scan(&assetID)
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	if assetID == "" || !slices.Contains(original.ResultImages, "/v1/assets/"+assetID+"/content") {
		return "", &operationError{409, "REDO_MODEL_REFERENCE_UNAVAILABLE", "这套图的正面成片已不可用，无法保持同一位模特"}
	}
	return assetID, nil
}
