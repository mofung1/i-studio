package repository

import (
	"database/sql"

	"github.com/istudio/server/internal/idgen"
)

const registerInspirationCategories = `INSERT INTO inspiration_categories(id,name)
SELECT 'category_' || md5(category), category FROM inspiration_prompts WHERE category<>'' GROUP BY category
ON CONFLICT(name) DO NOTHING`

// Category moves, renames and prompt saves share a lock, including across API instances.
func BeginInspirationEdit(db *sql.DB) (*sql.Tx, error) {
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	if _, err = tx.Exec("SELECT pg_advisory_xact_lock(724091025)"); err == nil {
		_, err = tx.Exec(registerInspirationCategories)
	}
	if err != nil {
		tx.Rollback()
		return nil, err
	}
	return tx, nil
}

func EnsureInspirationCategory(tx *sql.Tx, name string) error {
	_, err := tx.Exec("INSERT INTO inspiration_categories(id,name) VALUES($1,$2) ON CONFLICT(name) DO NOTHING", "category_"+idgen.New(), name)
	return err
}
