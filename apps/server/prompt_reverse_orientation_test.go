package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

func reverseExifFixture(orientation int, order binary.ByteOrder) []byte {
	data := make([]byte, 26)
	if order == binary.LittleEndian {
		copy(data, "II")
	} else {
		copy(data, "MM")
	}
	order.PutUint16(data[2:4], 42)
	order.PutUint32(data[4:8], 8)
	order.PutUint16(data[8:10], 1)
	order.PutUint16(data[10:12], 0x112)
	order.PutUint16(data[12:14], 3)
	order.PutUint32(data[14:18], 1)
	order.PutUint16(data[18:20], uint16(orientation))
	return data
}

func TestReverseImageOrientationTransformsAllExifCases(t *testing.T) {
	source := image.NewNRGBA(image.Rect(3, 4, 5, 7))
	for y := 0; y < 3; y++ {
		for x := 0; x < 2; x++ {
			source.SetNRGBA(x+3, y+4, color.NRGBA{R: uint8(y*2 + x + 1), A: 255})
		}
	}
	cases := []struct {
		orientation, width, height int
		pixels                     []uint8
	}{
		{1, 2, 3, []uint8{1, 2, 3, 4, 5, 6}}, {2, 2, 3, []uint8{2, 1, 4, 3, 6, 5}}, {3, 2, 3, []uint8{6, 5, 4, 3, 2, 1}}, {4, 2, 3, []uint8{5, 6, 3, 4, 1, 2}},
		{5, 3, 2, []uint8{1, 3, 5, 2, 4, 6}}, {6, 3, 2, []uint8{5, 3, 1, 6, 4, 2}}, {7, 3, 2, []uint8{6, 4, 2, 5, 3, 1}}, {8, 3, 2, []uint8{2, 4, 6, 1, 3, 5}},
	}
	for _, tc := range cases {
		out := orientReverseImage(source, tc.orientation)
		bounds := out.Bounds()
		if bounds.Dx() != tc.width || bounds.Dy() != tc.height {
			t.Fatal("orientation dimensions", tc.orientation, bounds)
		}
		for i, want := range tc.pixels {
			r, _, _, a := out.At(bounds.Min.X+i%tc.width, bounds.Min.Y+i/tc.width).RGBA()
			if uint8(r>>8) != want || a != 65535 {
				t.Fatal("orientation pixel", tc.orientation, i, r, want)
			}
		}
		for _, order := range []binary.ByteOrder{binary.LittleEndian, binary.BigEndian} {
			if got := reverseTIFFOrientation(reverseExifFixture(tc.orientation, order)); got != tc.orientation {
				t.Fatal("TIFF endian orientation", got, tc.orientation)
			}
		}
	}
	for _, bad := range [][]byte{nil, []byte("II"), {0, 0, 0, 0, 0, 0, 0, 0}, reverseExifFixture(9, binary.LittleEndian)} {
		if reverseTIFFOrientation(bad) != 1 {
			t.Fatal("malformed EXIF was not ignored")
		}
	}
}

func TestReverseServerCompressionHonorsExifWithoutChangingOriginal(t *testing.T) {
	source := image.NewNRGBA(image.Rect(0, 0, 64, 32))
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, source, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	exif := append([]byte("Exif\x00\x00"), reverseExifFixture(6, binary.LittleEndian)...)
	segment := []byte{0xff, 0xe1, 0, 0}
	binary.BigEndian.PutUint16(segment[2:4], uint16(len(exif)+2))
	segment = append(segment, exif...)
	original := append(append(append([]byte{}, encoded.Bytes()[:2]...), segment...), encoded.Bytes()[2:]...)
	saved := append([]byte{}, original...)
	if reverseImageOrientation(original) != 6 {
		t.Fatal("JPEG EXIF not found")
	}
	if _, width, height, err := validateReverseImage(original); err != nil || width != 32 || height != 64 {
		t.Fatal("original dimensions should follow its display orientation", width, height, err)
	}
	output, err := prepareReverseAnalysisData(original, "auto")
	if err != nil {
		t.Fatal(err)
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(output))
	if err != nil || config.Width != 32 || config.Height != 64 {
		t.Fatal("compressed image lost its orientation", config, err)
	}
	if !bytes.Equal(original, saved) {
		t.Fatal("original image mutated")
	}
	pngHeader := []byte("\x89PNG\r\n\x1a\n")
	chunk := make([]byte, 8)
	binary.BigEndian.PutUint32(chunk[:4], 26)
	copy(chunk[4:], "eXIf")
	pngData := append(append(append(pngHeader, chunk...), reverseExifFixture(8, binary.BigEndian)...), make([]byte, 4)...)
	if reverseImageOrientation(pngData) != 8 {
		t.Fatal("PNG orientation not read")
	}
	webpData := []byte("RIFF\x00\x00\x00\x00WEBPEXIF\x1a\x00\x00\x00")
	webpData = append(webpData, reverseExifFixture(3, binary.LittleEndian)...)
	if reverseImageOrientation(webpData) != 3 {
		t.Fatal("WebP orientation not read")
	}
	for _, data := range [][]byte{original[:15], pngData[:19], webpData[:24]} {
		if reverseImageOrientation(data) != 1 {
			t.Fatal("truncated metadata accepted")
		}
	}
}
