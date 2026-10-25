package studio

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"runtime"

	"golang.org/x/image/draw"
	"golang.org/x/sync/semaphore"
)

const maxThumbnailPixels int64 = 100_000_000

const thumbnailMemoryBudget int64 = 768 << 20

var thumbnailMemory = semaphore.NewWeighted(thumbnailMemoryBudget)

var errThumbnailSize = errors.New("图片像素或解码内存超过预览上限，请缩小图片尺寸后重试；原图仍可下载")

// File size does not describe decoded memory. Progressive JPEGs also retain
// DCT coefficient blocks; reserve their memory before starting the decoder.
func thumbnailDecodeMemory(raw []byte, config image.Config, format string) (int64, error) {
	if config.Width <= 0 || config.Height <= 0 || int64(config.Width) > maxThumbnailPixels/int64(config.Height) {
		return 0, errThumbnailSize
	}
	pixels := int64(config.Width) * int64(config.Height)
	decoded := pixels * 8 // Also covers PNG's 16-bit RGBA output.
	if format == "jpeg" {
		var err error
		decoded, err = jpegThumbnailMemory(raw, config)
		if err != nil {
			return 0, err
		}
	}
	reserved := decoded + int64(len(raw)) + (64 << 20)
	if reserved > thumbnailMemoryBudget {
		return 0, errThumbnailSize
	}
	return reserved, nil
}

func jpegThumbnailMemory(raw []byte, config image.Config) (int64, error) {
	if len(raw) < 2 || raw[0] != 0xff || raw[1] != 0xd8 {
		return 0, errThumbnailSize
	}
	var componentPixels int64
	var components int
	var progressive, jfif, adobeRGB, componentRGB bool
	for offset := 2; offset < len(raw); {
		if raw[offset] != 0xff {
			return 0, errThumbnailSize
		}
		for offset < len(raw) && raw[offset] == 0xff {
			offset++
		}
		if offset >= len(raw) {
			return 0, errThumbnailSize
		}
		marker := raw[offset]
		offset++
		if marker == 0xda {
			break
		} // Start of scan; remaining bytes are entropy-coded.
		if marker == 0xd9 {
			break
		}
		if marker == 0x01 || marker >= 0xd0 && marker <= 0xd7 {
			continue
		}
		if offset+2 > len(raw) {
			return 0, errThumbnailSize
		}
		length := int(binary.BigEndian.Uint16(raw[offset : offset+2]))
		if length < 2 || offset+length > len(raw) {
			return 0, errThumbnailSize
		}
		segment := raw[offset+2 : offset+length]
		offset += length
		switch marker {
		case 0xe0:
			jfif = jfif || bytes.HasPrefix(segment, []byte("JFIF\x00"))
		case 0xee:
			adobeRGB = adobeRGB || (len(segment) >= 12 && bytes.HasPrefix(segment, []byte("Adobe")) && segment[11] == 0)
		case 0xc0, 0xc1, 0xc2:
			if components != 0 || len(segment) < 6 {
				return 0, errThumbnailSize
			}
			components = int(segment[5])
			if components < 1 || components > 4 || len(segment) != 6+3*components {
				return 0, errThumbnailSize
			}
			h, v := int64(segment[7]>>4), int64(segment[7]&15)
			if components == 1 {
				h, v = 1, 1
			}
			if h < 1 || v < 1 || h > 4 || v > 4 {
				return 0, errThumbnailSize
			}
			mcuCount := ((int64(config.Width) + 8*h - 1) / (8 * h)) * ((int64(config.Height) + 8*v - 1) / (8 * v))
			for i := 0; i < components; i++ {
				sampling := segment[7+3*i]
				hi, vi := int64(sampling>>4), int64(sampling&15)
				if components == 1 {
					hi, vi = 1, 1
				}
				if hi < 1 || vi < 1 || hi > 4 || vi > 4 {
					return 0, errThumbnailSize
				}
				componentPixels += mcuCount * hi * vi * 64
			}
			progressive = marker == 0xc2
			componentRGB = components == 3 && segment[6] == 'R' && segment[9] == 'G' && segment[12] == 'B'
		}
	}
	if components == 0 {
		return 0, errThumbnailSize
	}
	decoded := componentPixels
	if progressive {
		decoded += componentPixels * 4
	} // image/jpeg's coefficient is int32.
	if components == 4 || components == 3 && !jfif && (adobeRGB || componentRGB) {
		decoded += int64(config.Width) * int64(config.Height) * 4
	}
	return decoded, nil
}

func generateAssetThumbnail(ctx context.Context, raw []byte) ([]byte, error) {
	return generateAssetPreview(ctx, raw, 480)
}

func generateAssetPreview(ctx context.Context, raw []byte, edge int) ([]byte, error) {
	config, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	reserved, err := thumbnailDecodeMemory(raw, config, format)
	if err != nil {
		return nil, err
	}
	if err = thumbnailMemory.Acquire(ctx, reserved); err != nil {
		return nil, err
	}
	defer func() {
		// The decoding function has returned, so its coefficient and image buffers
		// are unreachable. Reclaim large buffers before allowing the next big photo.
		if reserved > 128<<20 {
			runtime.GC()
		}
		thumbnailMemory.Release(reserved)
	}()
	return renderAssetPreview(raw, edge)
}

func fitThumbnailSize(width, height, edge int) (int, int) {
	if max(width, height) <= edge {
		return width, height
	}
	if width >= height {
		return edge, max(1, height*edge/width)
	}
	return max(1, width*edge/height), edge
}

func renderAssetThumbnail(raw []byte) ([]byte, error) {
	return renderAssetPreview(raw, 480)
}

func renderAssetPreview(raw []byte, edge int) ([]byte, error) {
	source, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	bounds := source.Bounds()
	// Kernel scaling allocates a buffer proportional to source height. Reduce
	// huge originals first, keeping the high-quality final pass bounded.
	if max(bounds.Dx(), bounds.Dy()) > edge*4 {
		width, height := fitThumbnailSize(bounds.Dx(), bounds.Dy(), edge*2)
		intermediate := image.NewRGBA(image.Rect(0, 0, width, height))
		draw.ApproxBiLinear.Scale(intermediate, intermediate.Bounds(), source, bounds, draw.Src, nil)
		source = intermediate
		bounds = source.Bounds()
	}
	width, height := fitThumbnailSize(bounds.Dx(), bounds.Dy(), edge)
	thumb := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(thumb, thumb.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.CatmullRom.Scale(thumb, thumb.Bounds(), source, bounds, draw.Over, nil)
	var encoded bytes.Buffer
	if err = jpeg.Encode(&encoded, thumb, &jpeg.Options{Quality: 85}); err != nil {
		return nil, err
	}
	return encoded.Bytes(), nil
}
