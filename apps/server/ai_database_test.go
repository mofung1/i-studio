package main

import (
	"database/sql"
	"net/url"
	"os"
	"testing"
)

// Uses an isolated schema and never reads production AI configuration.
func TestAIConfigurationPostgres(t *testing.T) {
	rawURL := os.Getenv("TEST_AI_DATABASE_URL")
	if rawURL == "" {
		t.Skip("TEST_AI_DATABASE_URL not set")
	}
	db, err := sql.Open("pgx", rawURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	schema := "ai_test_" + randomID()
	if _, err := db.Exec("CREATE SCHEMA " + schema); err != nil {
		t.Fatal(err)
	}
	defer db.Exec("DROP SCHEMA " + schema + " CASCADE")
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
	defer isolated.Close()
	if err := migrateDatabase(isolated); err != nil {
		t.Fatal(err)
	}
	s := testAIStore(t)
	s.db = isolated
	if err := s.ai.migrateLegacy(); err != nil {
		t.Fatal(err)
	}
	input := testEndpointInput("image", "openai_image")
	first, err := s.ai.save("", input)
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.ai.save("", input)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.ai.mutate(second.ID, false); err != nil {
		t.Fatal(err)
	}
	e, err := s.ai.resolve("image", "", "")
	if err != nil || e.ID != second.ID {
		t.Fatal(err)
	}
	if err := s.ai.mutate(second.ID, true); err != nil {
		t.Fatal(err)
	}
	e, err = s.ai.resolve("image", "", "")
	if err != nil || e.ID != first.ID {
		t.Fatal(err)
	}
	input.APIKey = ""
	input.Enabled = false
	if _, err := s.ai.save(first.ID, input); err != nil {
		t.Fatal(err)
	}
	if s.ai.hasAny("image") {
		t.Fatal("disabled endpoint still selected")
	}
	var encrypted string
	if err := isolated.QueryRow("SELECT api_key_encrypted FROM ai_endpoints WHERE id=$1", first.ID).Scan(&encrypted); err != nil {
		t.Fatal(err)
	}
	if encrypted == testEndpointInput("image", "openai_image").APIKey {
		t.Fatal("plaintext key in database")
	}
	if _, err := isolated.Exec("UPDATE prompt_templates SET content='custom' WHERE key='rewrite'"); err != nil {
		t.Fatal(err)
	}
	if err := s.ai.migrateLegacy(); err != nil {
		t.Fatal(err)
	}
	var content string
	if err := isolated.QueryRow("SELECT content FROM prompt_templates WHERE key='rewrite'").Scan(&content); err != nil || content != "custom" {
		t.Fatal("custom template overwritten", err)
	}
}
