package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

func thumbnailJPEGHeader(width, height int, progressive bool) []byte {
	marker := byte(0xc0)
	if progressive {
		marker = 0xc2
	}
	segment := []byte{8, byte(height >> 8), byte(height), byte(width >> 8), byte(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1}
	raw := []byte{0xff, 0xd8, 0xff, marker, 0, 0}
	binary.BigEndian.PutUint16(raw[4:6], uint16(len(segment)+2))
	raw = append(raw, segment...)
	return append(raw, 0xff, 0xda)
}
func TestThumbnailReservesProgressiveCoefficientMemory(t *testing.T) {
	config := image.Config{Width: 7087, Height: 10630, ColorModel: color.YCbCrModel}
	baseline, err := thumbnailDecodeMemory(thumbnailJPEGHeader(config.Width, config.Height, false), config, "jpeg")
	if err != nil {
		t.Fatal(err)
	}
	progressive, err := thumbnailDecodeMemory(thumbnailJPEGHeader(config.Width, config.Height, true), config, "jpeg")
	if err != nil {
		t.Fatal("75 MP progressive photo must remain previewable", err)
	}
	if progressive <= baseline*2 || progressive <= 512<<20 || progressive > thumbnailMemoryBudget {
		t.Fatal("progressive memory not accounted for", baseline, progressive)
	}
	for _, config := range []image.Config{{Width: 0, Height: 10}, {Width: 10001, Height: 10001}, {Width: 10000, Height: 10000}} {
		_, err := thumbnailDecodeMemory(nil, config, "png")
		if !errors.Is(err, errThumbnailSize) {
			t.Fatal("unsafe image allocation accepted", config, err)
		}
	}
}
func TestThumbnailWaitHonorsRequestCancellation(t *testing.T) {
	if err := thumbnailMemory.Acquire(context.Background(), thumbnailMemoryBudget); err != nil {
		t.Fatal(err)
	}
	defer thumbnailMemory.Release(thumbnailMemoryBudget)
	var raw bytes.Buffer
	if err := jpeg.Encode(&raw, image.NewGray(image.Rect(0, 0, 8, 8)), nil); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := generateAssetThumbnail(ctx, raw.Bytes()); !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled preview retained a decode slot", err)
	}
}
func TestThumbnailSupportsMoreThanFortyMegapixels(t *testing.T) {
	// A valid large compressed photo exercises the previous rejection boundary.
	source := image.NewGray(image.Rect(0, 0, 7000, 6500))
	var raw bytes.Buffer
	if err := jpeg.Encode(&raw, source, &jpeg.Options{Quality: 60}); err != nil {
		t.Fatal(err)
	}
	result, err := generateAssetThumbnail(context.Background(), raw.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(result))
	if err != nil || config.Width != 480 || config.Height != 445 {
		t.Fatal("large photo thumbnail has incorrect bounds", config, err)
	}
}
