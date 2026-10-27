package inspiration

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"
)

const catalogSeedName = "bundled-inspiration-v1"

var catalogImageName = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(jpg|jpeg|png|webp)$`)

type Catalog struct {
	Version    int               `json:"version"`
	Categories []CatalogCategory `json:"categories"`
	Prompts    []CatalogPrompt   `json:"prompts"`
	Files      []CatalogFile     `json:"files"`
	checksum   string
}

type CatalogCategory struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type CatalogPrompt struct {
	ID                string `json:"id"`
	Title             string `json:"title"`
	Category          string `json:"category"`
	Prompt            string `json:"prompt"`
	Source            string `json:"source"`
	ImageKey          string `json:"image_key"`
	ImageWidth        int    `json:"image_width"`
	ImageHeight       int    `json:"image_height"`
	Enabled           bool   `json:"enabled"`
	SortOrder         int    `json:"sort_order"`
	Instructions      string `json:"instructions"`
	RequiresReference bool   `json:"requires_reference"`
}

type CatalogFile struct {
	Key    string `json:"key"`
	SHA256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
}

type CatalogResult struct {
	Status     string `json:"status"`
	Prompts    int    `json:"prompts"`
	Categories int    `json:"categories"`
	Covers     int    `json:"covers"`
}

func LoadCatalog(path string) (*Catalog, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open bundled catalog: %w", err)
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 32*1024*1024+1))
	if err != nil || len(data) > 32*1024*1024 {
		return nil, errors.New("bundled catalog is unreadable or exceeds 32 MiB")
	}
	var catalog Catalog
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&catalog); err != nil {
		return nil, fmt.Errorf("decode bundled catalog: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, errors.New("bundled catalog must contain one JSON object")
	}
	if err := catalog.validate(); err != nil {
		return nil, err
	}
	checksum := sha256.Sum256(data)
	catalog.checksum = hex.EncodeToString(checksum[:])
	return &catalog, nil
}

func (c *Catalog) validate() error {
	if c.Version != 1 || len(c.Categories) == 0 || len(c.Prompts) == 0 {
		return errors.New("unsupported or empty bundled catalog")
	}
	categories, categoryIDs := make(map[string]bool), make(map[string]bool)
	for _, category := range c.Categories {
		if !catalogText(category.ID, 200) || !catalogText(category.Name, 80) || categories[category.Name] || categoryIDs[category.ID] {
			return errors.New("invalid or duplicate bundled category")
		}
		categories[category.Name], categoryIDs[category.ID] = true, true
	}
	files := make(map[string]bool)
	for _, file := range c.Files {
		checksum, err := hex.DecodeString(file.SHA256)
		if !catalogImageName.MatchString(file.Key) || files[file.Key] || err != nil || len(checksum) != sha256.Size || file.Bytes <= 0 || file.Bytes > 32*1024*1024 {
			return errors.New("invalid or duplicate bundled cover")
		}
		files[file.Key] = true
	}
	ids, references := make(map[string]bool), make(map[string]bool)
	for _, prompt := range c.Prompts {
		if !catalogText(prompt.ID, 200) || ids[prompt.ID] || !catalogText(prompt.Title, 160) || !catalogText(prompt.Prompt, 20000) || !categories[prompt.Category] || utf8.RuneCountInString(prompt.Source) > 500 || utf8.RuneCountInString(prompt.Instructions) > 1000 || strings.ContainsRune(prompt.Source+prompt.Instructions, '\x00') || prompt.SortOrder < -1000000 || prompt.SortOrder > 1000000 {
			return errors.New("invalid or duplicate bundled prompt")
		}
		if prompt.ImageKey == "" {
			if prompt.ImageWidth != 0 || prompt.ImageHeight != 0 {
				return errors.New("a bundled prompt without a cover must have zero dimensions")
			}
		} else if !files[prompt.ImageKey] || prompt.ImageWidth <= 0 || prompt.ImageHeight <= 0 {
			return errors.New("bundled prompt references a missing or invalid cover")
		} else {
			references[prompt.ImageKey] = true
		}
		ids[prompt.ID] = true
	}
	if len(references) != len(files) {
		return errors.New("bundled catalog contains unreferenced covers")
	}
	return nil
}

func catalogText(value string, limit int) bool {
	return strings.TrimSpace(value) != "" && !strings.ContainsRune(value, '\x00') && utf8.RuneCountInString(value) <= limit
}

// BootstrapCatalog installs a public catalog once per database. Existing libraries,
// including intentional edits or deletions, are never merged with a later image.
func BootstrapCatalog(ctx context.Context, db *sql.DB, catalog *Catalog, imageDir, storageRoot string) (CatalogResult, error) {
	result := CatalogResult{}
	if err := catalog.validate(); err != nil {
		return result, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock(724091025)"); err != nil {
		return result, err
	}
	var installed bool
	if err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM installation_seeds WHERE name=$1)", catalogSeedName).Scan(&installed); err != nil {
		return result, err
	}
	if installed {
		result.Status = "already-initialized"
		return result, nil
	}
	var existing bool
	if err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM inspiration_prompts) OR EXISTS(SELECT 1 FROM inspiration_categories)").Scan(&existing); err != nil {
		return result, err
	}
	if existing {
		result.Status = "existing-library-preserved"
	} else {
		if err := installCatalogCovers(ctx, catalog.Files, imageDir, storageRoot); err != nil {
			return result, err
		}
		for _, category := range catalog.Categories {
			if _, err := tx.ExecContext(ctx, "INSERT INTO inspiration_categories(id,name) VALUES($1,$2)", category.ID, category.Name); err != nil {
				return result, fmt.Errorf("insert bundled category: %w", err)
			}
		}
		for _, prompt := range catalog.Prompts {
			_, err := tx.ExecContext(ctx, `INSERT INTO inspiration_prompts
 (id,title,category,prompt,source,image_key,image_width,image_height,enabled,sort_order,instructions,requires_reference)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, prompt.ID, prompt.Title, prompt.Category, prompt.Prompt, prompt.Source, prompt.ImageKey, prompt.ImageWidth, prompt.ImageHeight, prompt.Enabled, prompt.SortOrder, prompt.Instructions, prompt.RequiresReference)
			if err != nil {
				return result, fmt.Errorf("insert bundled prompt: %w", err)
			}
		}
		result = CatalogResult{Status: "installed", Prompts: len(catalog.Prompts), Categories: len(catalog.Categories), Covers: len(catalog.Files)}
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO installation_seeds(name,checksum) VALUES($1,$2)", catalogSeedName, catalog.checksum); err != nil {
		return CatalogResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return CatalogResult{}, err
	}
	return result, nil
}

func installCatalogCovers(ctx context.Context, files []CatalogFile, sourceDir, storageRoot string) error {
	source, err := os.OpenRoot(sourceDir)
	if err != nil {
		return fmt.Errorf("open bundled covers: %w", err)
	}
	defer source.Close()
	directory := filepath.Join(storageRoot, "inspiration")
	if err := os.MkdirAll(directory, 0755); err != nil {
		return err
	}
	destination, err := os.OpenRoot(directory)
	if err != nil {
		return err
	}
	defer destination.Close()
	for _, file := range files {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := copyCatalogCover(source, destination, file); err != nil {
			return fmt.Errorf("bundled cover %s: %w", file.Key, err)
		}
	}
	return nil
}

func verifyCatalogCover(root *os.Root, file CatalogFile) error {
	input, err := root.Open(file.Key)
	if err != nil {
		return err
	}
	defer input.Close()
	info, err := input.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() != file.Bytes {
		return errors.New("cover size or file type does not match the catalog")
	}
	hash := sha256.New()
	if _, err := io.Copy(hash, input); err != nil {
		return err
	}
	if hex.EncodeToString(hash.Sum(nil)) != file.SHA256 {
		return errors.New("cover checksum does not match the catalog")
	}
	return nil
}

func copyCatalogCover(source, destination *os.Root, file CatalogFile) error {
	if err := verifyCatalogCover(source, file); err != nil {
		return err
	}
	output, err := destination.OpenFile(file.Key, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if errors.Is(err, os.ErrExist) {
		return verifyCatalogCover(destination, file)
	}
	if err != nil {
		return err
	}
	complete := false
	defer func() {
		output.Close()
		if !complete {
			_ = destination.Remove(file.Key)
		}
	}()
	input, err := source.Open(file.Key)
	if err != nil {
		return err
	}
	defer input.Close()
	if _, err := io.Copy(output, input); err != nil {
		return err
	}
	if err := output.Close(); err != nil {
		return err
	}
	if err := verifyCatalogCover(destination, file); err != nil {
		return err
	}
	complete = true
	return nil
}
