package main

import (
	"path/filepath"
	"testing"
	"time"
)

func TestGeneratedImageStorageKeyUsesDateFolder(t *testing.T) {
	key := generatedImageStorageKey(time.Date(2026, time.September, 19, 10, 30, 0, 0, time.FixedZone("CST", 8*60*60)), "abc123", ".png")
	if key != filepath.Join("20260919", "abc123.png") {
		t.Fatalf("generatedImageStorageKey() = %q", key)
	}
}

func TestGeneratedImageStorageKeyUsesShanghaiCalendarDate(t *testing.T) {
	// UTC 仍是 9 月 18 日，但北京时间已进入 9 月 19 日。
	now := time.Date(2026, time.September, 18, 16, 30, 0, 0, time.UTC).In(generationStorageLocation)
	key := generatedImageStorageKey(now, "abc123", ".png")
	if key != filepath.Join("20260919", "abc123.png") {
		t.Fatalf("generatedImageStorageKey() = %q", key)
	}
}
