package studio

import (
	"bytes"
	"path"
	"testing"
	"time"
)

func TestGeneratedImageStorageKeyUsesDateFolder(t *testing.T) {
	key := generatedImageStorageKey(time.Date(2026, time.September, 19, 10, 30, 0, 0, time.FixedZone("CST", 8*60*60)), "abc123", ".png")
	if key != "image/20260919/abc123.png" {
		t.Fatalf("generatedImageStorageKey() = %q", key)
	}
}

func TestPersistedGeneratedAssetsUseDatedImageDirectory(t *testing.T) {
	s, job, source := deliveryFixture(t, 1)
	before := time.Now().In(generationStorageLocation).Format("20060102")
	paths, err := s.persistGeneratedImages(job.ID, []string{source})
	if err != nil || len(paths) != 1 {
		t.Fatal(paths, err)
	}
	after := time.Now().In(generationStorageLocation).Format("20060102")
	var key string
	if err := s.db.QueryRow("SELECT storage_key FROM assets WHERE task_id=$1", job.ID).Scan(&key); err != nil {
		t.Fatal(err)
	}
	if path.Dir(key) != path.Join("image", before) && path.Dir(key) != path.Join("image", after) {
		t.Fatal("unexpected generated storage location", key)
	}
	response := libraryHTTP(t, s, "GET", paths[0], "member", "")
	want, _, err := readGeneratedImage(generatedImageClient, source)
	if err != nil || response.Code != 200 || !bytes.Equal(response.Body.Bytes(), want) {
		t.Fatal("generated asset unavailable", response.Code, err)
	}
}

func TestGeneratedImageStorageKeyUsesShanghaiCalendarDate(t *testing.T) {
	// UTC 仍是 9 月 18 日，但北京时间已进入 9 月 19 日。
	now := time.Date(2026, time.September, 18, 16, 30, 0, 0, time.UTC)
	key := generatedImageStorageKey(now, "abc123", ".png")
	if key != "image/20260919/abc123.png" {
		t.Fatalf("generatedImageStorageKey() = %q", key)
	}
}

func TestUploadedImageStorageKeyUsesShanghaiCalendarDate(t *testing.T) {
	for _, test := range []struct {
		name string
		now  time.Time
		want string
	}{
		{"before midnight", time.Date(2026, 9, 18, 15, 59, 59, 0, time.UTC), "user/20260918/abc123.jpg"},
		{"at midnight", time.Date(2026, 9, 18, 16, 0, 0, 0, time.UTC), "user/20260919/abc123.jpg"},
		{"new year", time.Date(2026, 12, 31, 16, 0, 0, 0, time.UTC), "user/20270101/abc123.jpg"},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := uploadedImageStorageKey(test.now, "abc123", ".jpg"); got != test.want {
				t.Fatalf("uploadedImageStorageKey() = %q, want %q", got, test.want)
			}
		})
	}
}
