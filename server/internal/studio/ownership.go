package studio

import (
	"fmt"
)

func (s *Service) userOwnsProject(userID, projectID string) bool {
	if projectID == "" {
		return true
	}
	if s.db == nil {
		return false
	}
	var exists bool
	return s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM projects WHERE id=$1 AND user_id=$2)", projectID, userID).Scan(&exists) == nil && exists
}

func (s *Service) userOwnsAsset(userID, assetID string) bool {
	if s.db == nil {
		return false
	}
	var exists bool
	return s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM assets WHERE id=$1 AND user_id=$2)", assetID, userID).Scan(&exists) == nil && exists
}

func (s *Service) validateInputOwnership(userID string, input map[string]any) error {
	if projectID, _ := input["projectId"].(string); projectID != "" && !s.userOwnsProject(userID, projectID) {
		return fmt.Errorf("所属项目不存在")
	}
	for _, key := range []string{"productAssetIds", "referenceAssetIds"} {
		items, _ := input[key].([]any)
		for _, item := range items {
			assetID, _ := item.(string)
			if !s.userOwnsAsset(userID, assetID) {
				return fmt.Errorf("素材不存在或无权访问")
			}
		}
	}
	for _, key := range []string{"modelAssetId", "sceneAssetId"} {
		if id, _ := input[key].(string); id != "" && !s.userOwnsAsset(userID, id) {
			return fmt.Errorf("素材不存在或无权访问")
		}
	}
	return nil
}
