package main

import (
	"fmt"
	"time"
)

// Only explicitly removed, hidden assets can be collected. Visible unused
// materials belong to the user and must not be treated as temporary garbage.
func (s *server) cleanupHiddenAssets() error {
	rows, err := s.db.Query(`SELECT a.id,a.user_id FROM assets a WHERE a.hidden_at<now()-interval '7 days' AND NOT EXISTS(SELECT 1 FROM generation_tasks WHERE user_id=a.user_id AND ` + stringsAssetReference("a.id") + `) ORDER BY a.hidden_at LIMIT 100`)
	if err != nil {
		return err
	}
	type candidate struct{ id, uid string }
	items := []candidate{}
	for rows.Next() {
		var item candidate
		if err = rows.Scan(&item.id, &item.uid); err != nil {
			break
		}
		items = append(items, item)
	}
	readErr := rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if readErr != nil {
		return readErr
	}
	for _, item := range items {
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		if _, err = tx.Exec("SELECT id FROM users WHERE id=$1 FOR UPDATE", item.uid); err != nil {
			_ = tx.Rollback()
			return err
		}
		var expired bool
		if err = tx.QueryRow("SELECT EXISTS(SELECT 1 FROM assets WHERE id=$1 AND user_id=$2 AND hidden_at<now()-interval '7 days')", item.id, item.uid).Scan(&expired); err != nil {
			_ = tx.Rollback()
			return err
		}
		if !expired {
			_ = tx.Rollback()
			continue
		}
		key, err := deleteAssetRecord(tx, item.uid, item.id)
		if err != nil {
			_ = tx.Rollback()
			continue
		}
		if err = tx.Commit(); err != nil {
			return err
		}
		if key != "" {
			_ = s.deleteAssetFiles(key)
		}
	}
	return nil
}
func (s *server) retryStorageDeletions() error {
	// Lease due jobs atomically; concurrent API replicas do not claim the same batch.
	rows, err := s.db.Query(`UPDATE storage_deletions SET next_attempt=now()+interval '10 minutes',attempts=attempts+1 WHERE storage_key IN (SELECT storage_key FROM storage_deletions WHERE next_attempt<=now() ORDER BY next_attempt FOR UPDATE SKIP LOCKED LIMIT 100) RETURNING storage_key`)
	if err != nil {
		return err
	}
	keys := []string{}
	for rows.Next() {
		var key string
		if err = rows.Scan(&key); err != nil {
			break
		}
		keys = append(keys, key)
	}
	readErr := rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if readErr != nil {
		return readErr
	}
	for _, key := range keys {
		if err = s.deleteAssetFiles(key); err != nil {
			fmt.Printf("object deletion deferred; retry scheduled\n")
		}
	}
	return nil
}
func (s *server) startStorageMaintenance() {
	go func() {
		run := func() {
			if err := s.cleanupHiddenAssets(); err != nil {
				fmt.Printf("hidden asset cleanup deferred\n")
			}
			if err := s.retryStorageDeletions(); err != nil {
				fmt.Printf("object cleanup deferred\n")
			}
		}
		run()
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			run()
		}
	}()
}
