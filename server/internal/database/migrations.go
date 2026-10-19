package database

import (
	"database/sql"
	"embed"
	"fmt"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Migrate adopts legacy idempotent scripts once, then records each SQL file.
// A single transaction and advisory lock protect concurrent application starts.
func Migrate(db *sql.DB) error {
	if db == nil {
		return nil
	}
	files, err := migrations.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	// Track complete SQL files separately from the legacy configuration markers.
	// Pre-011 migrations were idempotent and unversioned; execute them once on adoption.
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec("SELECT pg_advisory_xact_lock(79140000)"); err != nil {
		return err
	}
	if _, err = tx.Exec("CREATE TABLE IF NOT EXISTS schema_file_migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"); err != nil {
		return err
	}
	for _, file := range files {
		var applied bool
		if err = tx.QueryRow("SELECT EXISTS(SELECT 1 FROM schema_file_migrations WHERE name=$1)", file.Name()).Scan(&applied); err != nil {
			return err
		}
		if applied {
			continue
		}
		script, readErr := migrations.ReadFile("migrations/" + file.Name())
		if readErr != nil {
			return fmt.Errorf("read migration %s: %w", file.Name(), readErr)
		}
		if _, err = tx.Exec(string(script)); err != nil {
			return fmt.Errorf("apply migration %s: %w", file.Name(), err)
		}
		if _, err = tx.Exec("INSERT INTO schema_file_migrations(name) VALUES($1)", file.Name()); err != nil {
			return err
		}
	}
	return tx.Commit()
}
