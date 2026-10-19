package studio

import (
	"database/sql"
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
	return validateOwnedInput(userID, input, s.userOwnsProject, s.userOwnsAsset)
}

// Reservation already holds account rows. Use its connection for all reads so
// a bounded SQL pool cannot deadlock while other submissions wait for a slot.
func validateInputOwnershipTx(tx *sql.Tx, userID string, input map[string]any) error {
	project := func(uid, id string) bool {
		var exists bool
		return tx.QueryRow("SELECT EXISTS(SELECT 1 FROM projects WHERE id=$1 AND user_id=$2)", id, uid).Scan(&exists) == nil && exists
	}
	asset := func(uid, id string) bool {
		var exists bool
		return tx.QueryRow("SELECT EXISTS(SELECT 1 FROM assets WHERE id=$1 AND user_id=$2)", id, uid).Scan(&exists) == nil && exists
	}
	return validateOwnedInput(userID, input, project, asset)
}
func validateOwnedInput(userID string, input map[string]any, ownsProject, ownsAsset func(string, string) bool) error {
	if projectID, _ := input["projectId"].(string); projectID != "" && !ownsProject(userID, projectID) {
		return fmt.Errorf("所属项目不存在")
	}
	for _, key := range []string{"productAssetIds", "referenceAssetIds"} {
		items, _ := input[key].([]any)
		for _, item := range items {
			assetID, _ := item.(string)
			if !ownsAsset(userID, assetID) {
				return fmt.Errorf("素材不存在或无权访问")
			}
		}
	}
	for _, key := range []string{"modelAssetId", "sceneAssetId"} {
		if id, _ := input[key].(string); id != "" && !ownsAsset(userID, id) {
			return fmt.Errorf("素材不存在或无权访问")
		}
	}
	return nil
}
