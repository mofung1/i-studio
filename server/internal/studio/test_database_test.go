package studio

import (
	"database/sql"
	"net/url"
	"os"
	"testing"

	"github.com/istudio/server/internal/database"
	"github.com/istudio/server/internal/idgen"
)

// 数据库回归只操作独立 schema，不读取或迁移运行中的业务数据。
func isolatedTestDatabase(t *testing.T) *sql.DB { return isolatedDatabase(t, true) }
func isolatedDatabase(t *testing.T, migrate bool) *sql.DB {
	t.Helper()
	rawURL := os.Getenv("TEST_DATABASE_URL")
	if rawURL == "" {
		rawURL = os.Getenv("TEST_AI_DATABASE_URL")
	}
	if rawURL == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	db, err := sql.Open("pgx", rawURL)
	if err != nil {
		t.Fatal(err)
	}
	schema := "istudio_test_" + idgen.New()
	if _, err := db.Exec("CREATE SCHEMA " + schema); err != nil {
		db.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := db.Exec("DROP SCHEMA " + schema + " CASCADE"); err != nil {
			t.Errorf("drop test schema: %v", err)
		}
		db.Close()
	})
	parsed, err := url.Parse(rawURL)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	isolated, err := sql.Open("pgx", parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { isolated.Close() })
	if migrate {
		if err := database.Migrate(isolated); err != nil {
			t.Fatal(err)
		}
	}
	return isolated
}
