package inspiration

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"testing"

	"github.com/istudio/server/internal/database"
)

func sampleCatalog(t *testing.T) (*Catalog, string) {
	t.Helper()
	source := t.TempDir()
	data := []byte("public cover fixture")
	if err := os.WriteFile(filepath.Join(source, "cover.png"), data, 0644); err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(data)
	return &Catalog{
		Version: 1, checksum: "fixture",
		Categories: []CatalogCategory{{ID: "category-1", Name: "插画"}},
		Prompts:    []CatalogPrompt{{ID: "prompt-1", Title: "原始标题", Category: "插画", Prompt: "引号'与中文\n\\.\nDROP TABLE users;", Source: "公开作者", ImageKey: "cover.png", ImageWidth: 10, ImageHeight: 20, Enabled: true}},
		Files:      []CatalogFile{{Key: "cover.png", Bytes: int64(len(data)), SHA256: hex.EncodeToString(hash[:])}},
	}, source
}

func TestLoadCatalogRejectsPrivateFieldsAndUnsafeCovers(t *testing.T) {
	catalog, _ := sampleCatalog(t)
	data, err := json.Marshal(catalog)
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(t.TempDir(), "catalog.json")
	if err := os.WriteFile(file, data, 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadCatalog(file); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"../private.png", "/absolute.png", "@storage/cloud.png", "folder/cover.png"} {
		catalog.Files[0].Key = name
		catalog.Prompts[0].ImageKey = name
		if err := catalog.validate(); err == nil {
			t.Fatalf("accepted unsafe cover %q", name)
		}
	}
	data = append(data[:len(data)-1], []byte(`,"private_key":"must-not-import"}`)...)
	if err := os.WriteFile(file, data, 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadCatalog(file); err == nil {
		t.Fatal("accepted fields outside the public catalog schema")
	}
}

func TestCatalogCoversPreserveExistingFilesAndRejectCorruption(t *testing.T) {
	catalog, source := sampleCatalog(t)
	destination := t.TempDir()
	for range 2 {
		if err := installCatalogCovers(context.Background(), catalog.Files, source, destination); err != nil {
			t.Fatal(err)
		}
	}
	target := filepath.Join(destination, "inspiration", "cover.png")
	if err := os.WriteFile(target, []byte("existing custom cover"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := installCatalogCovers(context.Background(), catalog.Files, source, destination); err == nil {
		t.Fatal("overwrote a different existing cover")
	}
	data, err := os.ReadFile(target)
	if err != nil || string(data) != "existing custom cover" {
		t.Fatal("existing cover changed", err)
	}
	if err := os.WriteFile(filepath.Join(source, "cover.png"), []byte("corrupt"), 0644); err != nil {
		t.Fatal(err)
	}
	fresh := t.TempDir()
	if err := installCatalogCovers(context.Background(), catalog.Files, source, fresh); err == nil {
		t.Fatal("accepted a corrupt bundled cover")
	}
	if _, err := os.Stat(filepath.Join(fresh, "inspiration", "cover.png")); !os.IsNotExist(err) {
		t.Fatal("published a corrupt cover")
	}
}

func TestCatalogCoverCannotReadSymlinkOutsideSource(t *testing.T) {
	catalog, source := sampleCatalog(t)
	outside := filepath.Join(t.TempDir(), "private.png")
	if err := os.WriteFile(outside, []byte("public cover fixture"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(source, "cover.png")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(source, "cover.png")); err != nil {
		t.Fatal(err)
	}
	if err := installCatalogCovers(context.Background(), catalog.Files, source, t.TempDir()); err == nil {
		t.Fatal("read a symlink outside the bundled public directory")
	}
}

func catalogDatabase(t *testing.T) *sql.DB {
	t.Helper()
	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	db, err := database.Open(raw)
	if err != nil {
		t.Fatal(err)
	}
	var suffix [8]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		t.Fatal(err)
	}
	schema := "catalog_test_" + hex.EncodeToString(suffix[:])
	if _, err := db.Exec("CREATE SCHEMA " + schema); err != nil {
		db.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := db.Exec("DROP SCHEMA " + schema + " CASCADE"); err != nil {
			t.Error(err)
		}
		db.Close()
	})
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	isolated, err := database.Open(parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { isolated.Close() })
	if err := database.Migrate(isolated); err != nil {
		t.Fatal(err)
	}
	return isolated
}

func TestCatalogBootstrapPreservesEditsAndIntentionalEmptyLibrary(t *testing.T) {
	db := catalogDatabase(t)
	catalog, source := sampleCatalog(t)
	storage := t.TempDir()
	result, err := BootstrapCatalog(context.Background(), db, catalog, source, storage)
	if err != nil || result.Status != "installed" || result.Prompts != 1 {
		t.Fatal(result, err)
	}
	var original string
	if err := db.QueryRow("SELECT prompt FROM inspiration_prompts WHERE id='prompt-1'").Scan(&original); err != nil || original != catalog.Prompts[0].Prompt {
		t.Fatal("prompt content was executed or changed", err)
	}
	if _, err := db.Exec("UPDATE inspiration_prompts SET title='custom title',enabled=false"); err != nil {
		t.Fatal(err)
	}
	result, err = BootstrapCatalog(context.Background(), db, catalog, "missing-upgrade-image-directory", storage)
	if err != nil || result.Status != "already-initialized" {
		t.Fatal(result, err)
	}
	var title string
	var enabled bool
	if err := db.QueryRow("SELECT title,enabled FROM inspiration_prompts").Scan(&title, &enabled); err != nil || title != "custom title" || enabled {
		t.Fatal("upgrade changed an edited prompt", err)
	}
	if _, err := db.Exec("DELETE FROM inspiration_prompts; DELETE FROM inspiration_categories"); err != nil {
		t.Fatal(err)
	}
	result, err = BootstrapCatalog(context.Background(), db, catalog, source, storage)
	if err != nil || result.Status != "already-initialized" {
		t.Fatal("restored intentionally deleted library", result, err)
	}
	var count int
	if err := db.QueryRow("SELECT count(*) FROM inspiration_prompts").Scan(&count); err != nil || count != 0 {
		t.Fatal(count, err)
	}
}

func TestCatalogBootstrapPreservesAnExistingCustomLibrary(t *testing.T) {
	db := catalogDatabase(t)
	if _, err := db.Exec("INSERT INTO inspiration_categories(id,name) VALUES('custom','my category')"); err != nil {
		t.Fatal(err)
	}
	catalog, _ := sampleCatalog(t)
	result, err := BootstrapCatalog(context.Background(), db, catalog, "must-not-read", t.TempDir())
	if err != nil || result.Status != "existing-library-preserved" {
		t.Fatal(result, err)
	}
	var name string
	if err := db.QueryRow("SELECT name FROM inspiration_categories").Scan(&name); err != nil || name != "my category" {
		t.Fatal("changed the existing library", err)
	}
}

func TestCatalogBootstrapRollsBackWhenACoverIsCorrupt(t *testing.T) {
	db := catalogDatabase(t)
	catalog, source := sampleCatalog(t)
	if err := os.WriteFile(filepath.Join(source, "cover.png"), []byte("corrupt"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := BootstrapCatalog(context.Background(), db, catalog, source, t.TempDir()); err == nil {
		t.Fatal("accepted corruption")
	}
	var count int
	if err := db.QueryRow("SELECT (SELECT count(*) FROM inspiration_prompts)+(SELECT count(*) FROM inspiration_categories)+(SELECT count(*) FROM installation_seeds)").Scan(&count); err != nil || count != 0 {
		t.Fatal("committed partial initialization", count, err)
	}
}
