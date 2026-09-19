package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

type legacyGeneratedAsset struct {
	id  string
	key string
}

type taskResultUpdate struct {
	id      string
	images  []string
	modules []string
}

// cleanupLegacyGeneratedAssets removes generated assets stored by the old layout
// (at the storage root) while leaving uploaded source assets untouched.
func cleanupLegacyGeneratedAssets(db *sql.DB, storage objectStorage) error {
	if db == nil {
		return nil
	}
	rows, err := db.Query(`SELECT id, storage_key FROM assets WHERE filename LIKE 'generated-%' AND storage_key NOT LIKE '%/%'`)
	if err != nil {
		return err
	}
	var assets []legacyGeneratedAsset
	for rows.Next() {
		var asset legacyGeneratedAsset
		if err := rows.Scan(&asset.id, &asset.key); err != nil {
			_ = rows.Close()
			return err
		}
		assets = append(assets, asset)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if len(assets) == 0 {
		return nil
	}

	removedURLs := make(map[string]struct{}, len(assets))
	for _, asset := range assets {
		if err := storage.Delete(asset.key); err != nil {
			return fmt.Errorf("delete legacy generated asset %s: %w", asset.id, err)
		}
		removedURLs["/v1/assets/"+asset.id+"/content"] = struct{}{}
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	rollback := func(cause error) error {
		_ = tx.Rollback()
		return cause
	}

	resultRows, err := tx.Query("SELECT id, result_images, result_modules FROM generation_tasks")
	if err != nil {
		return rollback(err)
	}
	var updates []taskResultUpdate
	for resultRows.Next() {
		var id string
		var rawImages, rawModules []byte
		if err := resultRows.Scan(&id, &rawImages, &rawModules); err != nil {
			_ = resultRows.Close()
			return rollback(err)
		}
		var images, modules []string
		if json.Unmarshal(rawImages, &images) != nil {
			continue
		}
		_ = json.Unmarshal(rawModules, &modules)
		filteredImages := make([]string, 0, len(images))
		filteredModules := make([]string, 0, len(modules))
		changed := false
		for index, image := range images {
			if _, removed := removedURLs[strings.TrimSpace(image)]; removed {
				changed = true
				continue
			}
			filteredImages = append(filteredImages, image)
			if index < len(modules) {
				filteredModules = append(filteredModules, modules[index])
			}
		}
		if changed {
			updates = append(updates, taskResultUpdate{id: id, images: filteredImages, modules: filteredModules})
		}
	}
	if err := resultRows.Err(); err != nil {
		_ = resultRows.Close()
		return rollback(err)
	}
	if err := resultRows.Close(); err != nil {
		return rollback(err)
	}

	for _, update := range updates {
		rawImages, _ := json.Marshal(update.images)
		rawModules, _ := json.Marshal(update.modules)
		if _, err := tx.Exec("UPDATE generation_tasks SET result_images=$1::jsonb, result_modules=$2::jsonb WHERE id=$3", rawImages, rawModules, update.id); err != nil {
			return rollback(err)
		}
	}
	for _, asset := range assets {
		if _, err := tx.Exec("DELETE FROM assets WHERE id=$1", asset.id); err != nil {
			return rollback(err)
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return nil
}
