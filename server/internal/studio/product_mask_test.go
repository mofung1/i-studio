package studio

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"strings"
	"testing"
)

func maskTestPNG(t *testing.T, width, height int, pixel func(int, int) color.NRGBA) []byte {
	t.Helper()
	im := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			im.SetNRGBA(x, y, pixel(x, y))
		}
	}
	var b bytes.Buffer
	if err := png.Encode(&b, im); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func maskSolid(c color.NRGBA) func(int, int) color.NRGBA {
	return func(int, int) color.NRGBA { return c }
}

func TestProductMaskRejectsEmptyMismatchedAndOversizedImages(t *testing.T) {
	base := maskTestPNG(t, 3, 2, maskSolid(color.NRGBA{R: 220, A: 255}))
	selected := maskTestPNG(t, 3, 2, maskSolid(color.NRGBA{}))
	opaque := maskTestPNG(t, 3, 2, maskSolid(color.NRGBA{R: 255, G: 255, B: 255, A: 255}))
	wrongSize := maskTestPNG(t, 2, 2, maskSolid(color.NRGBA{}))
	var jpg bytes.Buffer
	if err := jpeg.Encode(&jpg, image.NewNRGBA(image.Rect(0, 0, 3, 2)), nil); err != nil {
		t.Fatal(err)
	}
	huge := append([]byte(nil), base...)
	binary.BigEndian.PutUint32(huge[16:20], 100_000)
	binary.BigEndian.PutUint32(huge[20:24], 100_000)
	binary.BigEndian.PutUint32(huge[29:33], crc32.ChecksumIEEE(huge[12:29]))
	for _, sample := range []struct {
		name           string
		original, mask []byte
	}{
		{"opaque means no selection", base, opaque}, {"dimensions differ", base, wrongSize},
		{"JPEG is not a mask", base, jpg.Bytes()}, {"corrupt mask", base, []byte("invalid")},
		{"oversized original header", huge, selected}, {"oversized mask header", base, huge},
	} {
		t.Run(sample.name, func(t *testing.T) {
			if _, _, err := decodeMaskPair(sample.original, sample.mask); err == nil {
				t.Fatal("invalid mask pair accepted")
			}
		})
	}
	if _, _, err := decodeMaskPair(base, selected); err != nil {
		t.Fatalf("transparent selected mask rejected: %v", err)
	}
	semi := maskTestPNG(t, 3, 2, maskSolid(color.NRGBA{A: 128}))
	if _, _, err := decodeMaskPair(base, semi); err != nil {
		t.Fatalf("soft selection rejected: %v", err)
	}
}

func TestProductMaskCompositeLocksOutsideAndBlendsSoftEdges(t *testing.T) {
	original := maskTestPNG(t, 3, 1, func(x, y int) color.NRGBA {
		if x == 2 {
			return color.NRGBA{R: 71, G: 19, B: 203, A: 73}
		}
		return color.NRGBA{R: 255, A: 255}
	})
	mask := maskTestPNG(t, 3, 1, func(x, y int) color.NRGBA { return color.NRGBA{A: []uint8{0, 128, 255}[x]} })
	generated := maskTestPNG(t, 3, 1, maskSolid(color.NRGBA{B: 255, A: 255}))
	merged, err := compositeMaskedImage(original, mask, generated)
	if err != nil {
		t.Fatal(err)
	}
	im, format, err := image.Decode(bytes.NewReader(merged))
	if err != nil || format != "png" {
		t.Fatal("result must be readable PNG", err)
	}
	expected := []color.NRGBA{{B: 255, A: 255}, {R: 128, B: 127, A: 255}, {R: 71, G: 19, B: 203, A: 73}}
	for x, want := range expected {
		if got := color.NRGBAModel.Convert(im.At(x, 0)).(color.NRGBA); got != want {
			t.Errorf("pixel %d got %+v want %+v", x, got, want)
		}
	}
}

func TestProductMaskCompositePreservesOriginalSizeAndRejectsWrongRatio(t *testing.T) {
	original := maskTestPNG(t, 4, 2, maskSolid(color.NRGBA{R: 255, A: 255}))
	mask := maskTestPNG(t, 4, 2, func(x, y int) color.NRGBA {
		if x == 0 {
			return color.NRGBA{}
		}
		return color.NRGBA{A: 255}
	})
	for _, size := range [][2]int{{2, 1}, {8, 4}} {
		t.Run(fmt.Sprint(size), func(t *testing.T) {
			generated := maskTestPNG(t, size[0], size[1], maskSolid(color.NRGBA{G: 255, A: 255}))
			merged, err := compositeMaskedImage(original, mask, generated)
			if err != nil {
				t.Fatal(err)
			}
			im, _, err := image.Decode(bytes.NewReader(merged))
			if err != nil || im.Bounds().Size() != image.Pt(4, 2) {
				t.Fatal("original dimensions not retained", err)
			}
			for y := 0; y < 2; y++ {
				for x := 0; x < 4; x++ {
					want := color.NRGBA{R: 255, A: 255}
					if x == 0 {
						want = color.NRGBA{G: 255, A: 255}
					}
					if got := color.NRGBAModel.Convert(im.At(x, y)).(color.NRGBA); got != want {
						t.Fatalf("wrong scaled composite at %d,%d: %+v", x, y, got)
					}
				}
			}
		})
	}
	if _, err := compositeMaskedImage(original, mask, maskTestPNG(t, 3, 2, maskSolid(color.NRGBA{G: 255, A: 255}))); err == nil {
		t.Fatal("different aspect ratio accepted")
	}
}

func TestProductMaskProviderMultipartCarriesActualPNGAndOriginalDimensions(t *testing.T) {
	original := maskTestPNG(t, 12, 8, maskSolid(color.NRGBA{R: 255, A: 255}))
	mask := maskTestPNG(t, 12, 8, func(x, y int) color.NRGBA {
		if x < 4 {
			return color.NRGBA{}
		}
		return color.NRGBA{A: 255}
	})
	calls := 0
	client := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		calls++
		if req.URL.Path != "/v1/images/edits" {
			t.Fatalf("wrong route %s", req.URL.Path)
		}
		if err := req.ParseMultipartForm(1 << 20); err != nil {
			t.Fatal(err)
		}
		defer req.MultipartForm.RemoveAll()
		if req.FormValue("size") != "12x8" || req.FormValue("n") != "1" {
			t.Fatal("provider did not retain original dimensions/single output")
		}
		for name, want := range map[string][]byte{"image[]": original, "mask": mask} {
			files := req.MultipartForm.File[name]
			if len(files) != 1 || files[0].Header.Get("Content-Type") != "image/png" {
				t.Fatalf("missing PNG %s", name)
			}
			file, err := files[0].Open()
			if err != nil {
				t.Fatal(err)
			}
			got, err := io.ReadAll(file)
			file.Close()
			if err != nil || !bytes.Equal(got, want) {
				t.Fatalf("%s bytes changed", name)
			}
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"data":[{"b64_json":"` + base64.StdEncoding.EncodeToString(original) + `"}]}`))}, nil
	})}
	p := &imageProtocolTransport{baseURL: "https://fixture.invalid", apiKey: "fixture-key", model: "fixture-model", protocol: "openai_images", client: client}
	_, err := p.Submit(context.Background(), map[string]any{"prompt": "change only selected area", "aspectRatio": "3:4", "resolution": "2K", "maskAssetId": "mask", "sourceImages": []map[string]string{{"mime": "image/png", "data": base64.StdEncoding.EncodeToString(original)}}, "sourceMask": map[string]string{"mime": "image/png", "data": base64.StdEncoding.EncodeToString(mask)}})
	if err != nil || calls != 1 {
		t.Fatal("masked edit failed", err, calls)
	}
}

func TestProductMaskRequiresVerifiedModelAndSupportedProtocol(t *testing.T) {
	input := map[string]any{"maskAssetId": "mask", "aspectRatio": "1:1", "resolution": "2K"}
	capabilities := defaultModelCapabilities()
	if err := validateModelParameters(capabilities, input); err == nil {
		t.Fatal("unverified public model accepted mask")
	}
	capabilities.MaskEditing = true
	if err := validateModelParameters(capabilities, input); err != nil {
		t.Fatal("verified model rejected", err)
	}
	for _, protocol := range []string{"openai_chat", "gemini_native"} {
		for _, in := range []map[string]any{input, {"sourceMask": map[string]string{"mime": "image/png", "data": "ignored"}}} {
			if err := validateImageProtocolParameters(protocol, in); err == nil {
				t.Errorf("%s accepted mask", protocol)
			}
		}
	}
	if err := validateImageProtocolParameters("openai_images", input); err != nil {
		t.Fatal(err)
	}
}

func TestProductMaskFieldsRequirePairedSingleImageEdit(t *testing.T) {
	valid := func() map[string]any {
		return map[string]any{"mode": "general", "productId": "product", "productVersion": float64(1), "productPurpose": "main", "parentAssetId": "parent", "maskAssetId": "mask", "count": float64(1)}
	}
	for _, name := range []string{"missing product", "missing parent", "missing mask", "multiple outputs"} {
		t.Run(name, func(t *testing.T) {
			input := valid()
			switch name {
			case "missing product":
				delete(input, "productId")
			case "missing parent":
				delete(input, "parentAssetId")
			case "missing mask":
				delete(input, "maskAssetId")
			case "multiple outputs":
				input["count"] = float64(2)
			}
			if err := validateProductGenerationFields(input); err == nil {
				t.Fatal("invalid edit fields accepted")
			}
		})
	}
	if err := validateProductGenerationFields(valid()); err != nil {
		t.Fatal(err)
	}
}
