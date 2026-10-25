package studio

import (
	"path"
	"time"
)

var generationStorageLocation = time.FixedZone("Asia/Shanghai", 8*60*60)

func uploadedImageStorageKey(now time.Time, id, ext string) string {
	return path.Join("user", now.In(generationStorageLocation).Format("20060102"), id+ext)
}

func generatedImageStorageKey(now time.Time, id, ext string) string {
	return path.Join("image", now.In(generationStorageLocation).Format("20060102"), id+ext)
}
