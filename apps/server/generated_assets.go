package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"image"
	"io"
	"net/http"
	"strings"
	"time"
)

const maxGeneratedImageBytes = 25 << 20

func (s *server) persistGeneratedImages(taskID string, urls []string) ([]string, error) {
	if s.db == nil {
		return urls, nil
	}
	var userID string
	var projectID *string
	if err := s.db.QueryRow("SELECT user_id, project_id FROM generation_tasks WHERE id=$1", taskID).Scan(&userID, &projectID); err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 45 * time.Second}
	paths := make([]string, 0, len(urls))
	for index, url := range urls {
		data, mime, err := readGeneratedImage(client, url)
		if err != nil {
			return nil, fmt.Errorf("download generated image %d failed: %w", index+1, err)
		}
		ext := extensionForMime(mime)
		if ext == "" {
			return nil, fmt.Errorf("unsupported generated image type %q", mime)
		}
		assetID, key := randomID(), randomID()+ext
		if err := s.storage.Save(key, bytes.NewReader(data)); err != nil {
			return nil, err
		}
		width, height := 0, 0
		if config, _, err := image.DecodeConfig(bytes.NewReader(data)); err == nil {
			width, height = config.Width, config.Height
		}
		hash := sha256.Sum256(data)
		filename := fmt.Sprintf("generated-%s-%02d%s", taskID[:8], index+1, ext)
		if _, err := s.db.Exec("INSERT INTO assets (id,user_id,project_id,filename,storage_key,mime,size_bytes,width,height,hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", assetID, userID, projectID, filename, key, mime, len(data), width, height, hex.EncodeToString(hash[:])); err != nil {
			return nil, err
		}
		paths = append(paths, "/v1/assets/"+assetID+"/content")
	}
	return paths, nil
}

func readGeneratedImage(client *http.Client, source string) ([]byte, string, error) {
	if strings.HasPrefix(source, "data:image/") {
		metadata, encoded, found := strings.Cut(source, ",")
		if !found || !strings.HasSuffix(metadata, ";base64") {
			return nil, "", fmt.Errorf("invalid image data URL")
		}
		mime := strings.TrimSuffix(strings.TrimPrefix(metadata, "data:"), ";base64")
		data, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || len(data) == 0 || len(data) > maxGeneratedImageBytes {
			return nil, "", fmt.Errorf("invalid base64 image")
		}
		return validateGeneratedImage(data, mime)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	data, readErr := io.ReadAll(io.LimitReader(resp.Body, maxGeneratedImageBytes+1))
	if readErr != nil || resp.StatusCode >= 300 || len(data) == 0 || len(data) > maxGeneratedImageBytes {
		return nil, "", fmt.Errorf("remote image response invalid")
	}
	return validateGeneratedImage(data, strings.Split(resp.Header.Get("Content-Type"), ";")[0])
}

func validateGeneratedImage(data []byte, declaredMime string) ([]byte, string, error) {
	detectedMime := http.DetectContentType(data)
	if extensionForMime(detectedMime) == "" {
		return nil, "", fmt.Errorf("unsupported generated image content")
	}
	if declaredMime != "" && declaredMime != "application/octet-stream" && declaredMime != detectedMime {
		return nil, "", fmt.Errorf("generated image content type mismatch")
	}
	return data, detectedMime, nil
}

func extensionForMime(mime string) string {
	switch mime {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	default:
		return ""
	}
}
