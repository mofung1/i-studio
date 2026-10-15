package database

import (
	"database/sql"
	"embed"
	"fmt"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Migrate preserves the existing idempotent migrations and their execution order.
// Existing installations do not need to reset data or adopt a new migration table.
func Migrate(db *sql.DB) error {
	if db == nil {
		return nil
	}
	files, err := migrations.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	for _, file := range files {
		script, err := migrations.ReadFile("migrations/" + file.Name())
		if err != nil {
			return fmt.Errorf("read migration %s: %w", file.Name(), err)
		}
		if _, err := db.Exec(string(script)); err != nil {
			return fmt.Errorf("apply migration %s: %w", file.Name(), err)
		}
	}
	return nil
}
