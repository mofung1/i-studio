package main

import (
	"bytes"
	"encoding/binary"
	"image"
)

// Go's raster decoders do not apply EXIF orientation. Honor it before stripping metadata.
func reverseImageOrientation(data []byte) int {
	if len(data) >= 2 && data[0] == 0xff && data[1] == 0xd8 {
		for offset := 2; offset+1 < len(data); {
			if data[offset] != 0xff {
				break
			}
			for offset < len(data) && data[offset] == 0xff {
				offset++
			}
			if offset >= len(data) {
				break
			}
			marker := data[offset]
			offset++
			if marker == 0xda || marker == 0xd9 {
				break
			}
			if marker == 0x01 || (marker >= 0xd0 && marker <= 0xd7) {
				continue
			}
			if offset+2 > len(data) {
				break
			}
			size := int(binary.BigEndian.Uint16(data[offset : offset+2]))
			if size < 2 || size > len(data)-offset {
				break
			}
			payload := data[offset+2 : offset+size]
			offset += size
			if marker == 0xe1 && bytes.HasPrefix(payload, []byte("Exif\x00\x00")) {
				return reverseTIFFOrientation(payload[6:])
			}
		}
	}
	if bytes.HasPrefix(data, []byte("\x89PNG\r\n\x1a\n")) {
		for offset := 8; offset+12 <= len(data); {
			size := uint64(binary.BigEndian.Uint32(data[offset : offset+4]))
			if size > uint64(len(data)-offset-12) {
				break
			}
			if string(data[offset+4:offset+8]) == "eXIf" {
				return reverseTIFFOrientation(data[offset+8 : offset+8+int(size)])
			}
			offset += int(size) + 12
		}
	}
	if len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		for offset := 12; offset+8 <= len(data); {
			size := uint64(binary.LittleEndian.Uint32(data[offset+4 : offset+8]))
			if size > uint64(len(data)-offset-8) {
				break
			}
			if string(data[offset:offset+4]) == "EXIF" {
				payload := bytes.TrimPrefix(data[offset+8:offset+8+int(size)], []byte("Exif\x00\x00"))
				return reverseTIFFOrientation(payload)
			}
			offset += 8 + int(size) + (int(size) & 1)
		}
	}
	return 1
}

func reverseTIFFOrientation(data []byte) int {
	if len(data) < 8 {
		return 1
	}
	var order binary.ByteOrder
	switch string(data[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 1
	}
	if order.Uint16(data[2:4]) != 42 {
		return 1
	}
	offset := uint64(order.Uint32(data[4:8]))
	if offset < 8 || offset+2 > uint64(len(data)) {
		return 1
	}
	count := int(order.Uint16(data[offset : offset+2]))
	offset += 2
	for i := 0; i < count && offset+12 <= uint64(len(data)); i, offset = i+1, offset+12 {
		entry := data[offset : offset+12]
		if order.Uint16(entry[:2]) == 0x112 && order.Uint16(entry[2:4]) == 3 && order.Uint32(entry[4:8]) == 1 {
			value := int(order.Uint16(entry[8:10]))
			if value >= 1 && value <= 8 {
				return value
			}
			return 1
		}
	}
	return 1
}

func orientReverseImage(source image.Image, orientation int) image.Image {
	if orientation < 2 || orientation > 8 {
		return source
	}
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	outWidth, outHeight := width, height
	if orientation >= 5 {
		outWidth, outHeight = height, width
	}
	out := image.NewNRGBA(image.Rect(0, 0, outWidth, outHeight))
	for y := 0; y < outHeight; y++ {
		for x := 0; x < outWidth; x++ {
			sx, sy := x, y
			switch orientation {
			case 2:
				sx = width - 1 - x
			case 3:
				sx, sy = width-1-x, height-1-y
			case 4:
				sy = height - 1 - y
			case 5:
				sx, sy = y, x
			case 6:
				sx, sy = y, height-1-x
			case 7:
				sx, sy = width-1-y, height-1-x
			case 8:
				sx, sy = width-1-y, x
			}
			out.Set(x, y, source.At(bounds.Min.X+sx, bounds.Min.Y+sy))
		}
	}
	return out
}
