package studio

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"

	"golang.org/x/image/draw"
)

func validateProductGenerationFields(input map[string]any) error {
	if input["productId"] == nil {
		for _, key := range []string{"productVersion", "productPurpose", "productInstructions", "parentAssetId", "maskAssetId"} {
			if input[key] != nil {
				return fmt.Errorf("商品生成参数需要关联商品档案")
			}
		}
		return nil
	}
	if err := requireText(input, "productId", 1, 200); err != nil {
		return err
	}
	if stringValue(input["mode"], "") != "general" {
		return fmt.Errorf("商品管理需要使用通用生成模式")
	}
	if !isJSONInteger(input["productVersion"]) || input["productVersion"].(float64) < 1 {
		return fmt.Errorf("请先保存商品档案")
	}
	if err := requireOneOf(input, "productPurpose", stringSet("main", "scene", "detail", "selling-point"), ""); err != nil {
		return err
	}
	if input["productInstructions"] != nil {
		if err := requireText(input, "productInstructions", 0, 2000); err != nil {
			return err
		}
	}
	if input["maskAssetId"] != nil || input["parentAssetId"] != nil {
		for _, key := range []string{"parentAssetId", "maskAssetId"} {
			if err := requireText(input, key, 1, 200); err != nil {
				return err
			}
		}
		if intValue(input["count"], 1) != 1 {
			return fmt.Errorf("局部修改每次只支持一张图片")
		}
	}
	return nil
}

func (s *Service) ownedMaskAsset(uid, id string, maxBytes int64) ([]byte, error) {
	var key string
	if s.db == nil || s.db.QueryRow("SELECT storage_key FROM assets WHERE id=$1 AND user_id=$2", id, uid).Scan(&key) != nil {
		return nil, fmt.Errorf("修改素材不存在或无权访问")
	}
	f, err := s.storage.Open(key)
	if err != nil {
		return nil, fmt.Errorf("修改素材文件不可用")
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxBytes+1))
	if err != nil || len(data) == 0 || int64(len(data)) > maxBytes {
		return nil, fmt.Errorf("修改素材大小不符合要求")
	}
	return data, nil
}

func decodeMaskPair(original, rawMask []byte) (image.Image, image.Image, error) {
	config, _, err := image.DecodeConfig(bytes.NewReader(original))
	if err != nil || config.Width < 1 || config.Height < 1 || int64(config.Width)*int64(config.Height) > 40_000_000 {
		return nil, nil, fmt.Errorf("待修改图片无法读取")
	}
	mc, format, err := image.DecodeConfig(bytes.NewReader(rawMask))
	if err != nil || format != "png" || mc.Width != config.Width || mc.Height != config.Height {
		return nil, nil, fmt.Errorf("选区必须是与原图尺寸一致的 PNG 图片")
	}
	mask, err := png.Decode(bytes.NewReader(rawMask))
	if err != nil {
		return nil, nil, fmt.Errorf("选区图片无法读取")
	}
	hasSelection := false
	for y := 0; y < config.Height && !hasSelection; y++ {
		for x := 0; x < config.Width; x++ {
			_, _, _, alpha := mask.At(x, y).RGBA()
			if alpha < 65535 {
				hasSelection = true
				break
			}
		}
	}
	if !hasSelection {
		return nil, nil, fmt.Errorf("请先涂抹需要修改的区域")
	}
	base, _, err := image.Decode(bytes.NewReader(original))
	if err != nil {
		return nil, nil, fmt.Errorf("待修改图片无法读取")
	}
	return base, mask, nil
}

func (s *Service) maskPair(uid string, input map[string]any) ([]byte, []byte, error) {
	original, err := s.ownedMaskAsset(uid, stringValue(input["parentAssetId"], ""), 20<<20)
	if err != nil {
		return nil, nil, err
	}
	mask, err := s.ownedMaskAsset(uid, stringValue(input["maskAssetId"], ""), 4<<20)
	if err != nil {
		return nil, nil, err
	}
	return original, mask, nil
}

func (s *Service) validateProductMask(uid string, input map[string]any) error {
	if stringValue(input["maskAssetId"], "") == "" {
		return nil
	}
	original, mask, err := s.maskPair(uid, input)
	if err != nil {
		return err
	}
	_, _, err = decodeMaskPair(original, mask)
	return err
}

func (s *Service) attachSourceMask(input map[string]any) error {
	delete(input, "sourceMask")
	if stringValue(input["maskAssetId"], "") == "" {
		return nil
	}
	var uid string
	if s.db.QueryRow("SELECT user_id FROM assets WHERE id=$1", stringValue(input["parentAssetId"], "")).Scan(&uid) != nil {
		return fmt.Errorf("待修改图片不存在")
	}
	original, mask, err := s.maskPair(uid, input)
	if err != nil {
		return err
	}
	if _, _, err = decodeMaskPair(original, mask); err != nil {
		return err
	}
	input["sourceMask"] = map[string]string{"mime": "image/png", "data": base64.StdEncoding.EncodeToString(mask)}
	return nil
}

// A model mask is guidance, not a pixel lock. Composite the delivered result so
// fully opaque mask pixels always come from the saved original. This also runs
// on recovery, before hashing, quota accounting and publishing the new asset.
func compositeMaskedImage(original, rawMask, generated []byte) ([]byte, error) {
	base, mask, err := decodeMaskPair(original, rawMask)
	if err != nil {
		return nil, err
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(generated))
	if err != nil || config.Width < 1 || config.Height < 1 || int64(config.Width)*int64(config.Height) > 40_000_000 {
		return nil, fmt.Errorf("修改结果图片无法读取")
	}
	result, _, err := image.Decode(bytes.NewReader(generated))
	if err != nil {
		return nil, err
	}
	if result.Bounds().Size() != base.Bounds().Size() {
		// Refuse to distort a returned composition to another aspect ratio.
		if int64(result.Bounds().Dx())*int64(base.Bounds().Dy()) != int64(result.Bounds().Dy())*int64(base.Bounds().Dx()) {
			return nil, fmt.Errorf("修改结果比例与原图不一致，请使用原图比例重试")
		}
		resized := image.NewNRGBA(base.Bounds())
		draw.CatmullRom.Scale(resized, resized.Bounds(), result, result.Bounds(), draw.Src, nil)
		result = resized
	}
	out := image.NewNRGBA(base.Bounds())
	blend := func(a, b uint8, keep uint32) uint8 {
		return uint8((uint32(a)*keep + uint32(b)*(65535-keep) + 32767) / 65535)
	}
	for y := 0; y < out.Bounds().Dy(); y++ {
		for x := 0; x < out.Bounds().Dx(); x++ {
			a := color.NRGBAModel.Convert(base.At(x, y)).(color.NRGBA)
			b := color.NRGBAModel.Convert(result.At(x, y)).(color.NRGBA)
			_, _, _, keep := mask.At(x, y).RGBA()
			out.SetNRGBA(x, y, color.NRGBA{R: blend(a.R, b.R, keep), G: blend(a.G, b.G, keep), B: blend(a.B, b.B, keep), A: blend(a.A, b.A, keep)})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, out); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (s *Service) protectMaskedDelivery(ctx context.Context, taskID string, data []byte, mime string) ([]byte, string, error) {
	var uid string
	var raw []byte
	if err := s.db.QueryRowContext(ctx, "SELECT user_id,input FROM generation_tasks WHERE id=$1", taskID).Scan(&uid, &raw); err != nil {
		return nil, "", err
	}
	var input map[string]any
	if err := json.Unmarshal(raw, &input); err != nil {
		return nil, "", err
	}
	if stringValue(input["maskAssetId"], "") == "" {
		return data, mime, nil
	}
	original, mask, err := s.maskPair(uid, input)
	if err != nil {
		return nil, "", err
	}
	merged, err := compositeMaskedImage(original, mask, data)
	return merged, "image/png", err
}
