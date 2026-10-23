package main

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// halves: left half red, right half blue (w×h)
func halves(w, h int) *image.RGBA {
	im := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			c := color.RGBA{220, 20, 20, 255}
			if x >= w/2 {
				c = color.RGBA{20, 20, 220, 255}
			}
			im.Set(x, y, c)
		}
	}
	return im
}

func jpegWithOrientation(t *testing.T, im image.Image, o int) []byte {
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, im, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	b := buf.Bytes()
	tiff := []byte{'M', 'M', 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, byte(o), 0, 0, 0, 0, 0, 0}
	seg := append([]byte("Exif\x00\x00"), tiff...)
	app1 := []byte{0xFF, 0xE1, byte((len(seg) + 2) >> 8), byte(len(seg) + 2)}
	app1 = append(app1, seg...)
	out := append([]byte{}, b[:2]...)
	out = append(out, app1...)
	return append(out, b[2:]...)
}

func TestExifOrientation(t *testing.T) {
	for o := 1; o <= 8; o++ {
		b := jpegWithOrientation(t, halves(8, 4), o)
		if got := exifOrientation(b); got != o {
			t.Fatalf("orientation %d: got %d", o, got)
		}
	}
}

// render page 1 of a PDF to an RGB image with pdftoppm (skips when not installed)
func renderPDF(t *testing.T, pdf []byte) image.Image {
	if _, err := exec.LookPath("pdftoppm"); err != nil {
		t.Skip("pdftoppm 없음")
	}
	dir := t.TempDir()
	in := filepath.Join(dir, "a.pdf")
	os.WriteFile(in, pdf, 0o644)
	if q, err := exec.LookPath("qpdf"); err == nil {
		if out, err := exec.Command(q, "--check", in).CombinedOutput(); err != nil {
			t.Fatalf("qpdf --check: %v\n%s", err, out)
		}
	}
	if out, err := exec.Command("pdftoppm", "-r", "20", "-png", "-f", "1", "-l", "1", in, filepath.Join(dir, "p")).CombinedOutput(); err != nil {
		t.Fatalf("pdftoppm: %v %s", err, out)
	}
	m, _ := filepath.Glob(filepath.Join(dir, "p*.png"))
	if len(m) == 0 {
		t.Fatal("no render")
	}
	f, _ := os.Open(m[0])
	defer f.Close()
	im, err := png.Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	return im
}

func isRed(c color.Color) bool  { r, g, b, _ := c.RGBA(); return r>>8 > 150 && g>>8 < 90 && b>>8 < 90 }
func isBlue(c color.Color) bool { r, g, b, _ := c.RGBA(); return b>>8 > 150 && r>>8 < 90 && g>>8 < 90 }
func isWhite(c color.Color) bool {
	r, g, b, _ := c.RGBA()
	return r>>8 > 235 && g>>8 > 235 && b>>8 > 235
}

func TestPDFOrientationAndClip(t *testing.T) {
	// 가로 40×20 사진, 방향 6(시계 방향 90도) → 세로로 보이고 위가 빨강, 아래가 파랑
	jpg := jpegWithOrientation(t, halves(40, 20), 6)
	spec := &PrintSpec{Name: "t", W: 100, H: 200, Pages: []PrintPage{{Ops: []PrintOp{
		{Type: "image", Data: base64.StdEncoding.EncodeToString(jpg), Box: []float64{0, 0, 100, 200}},
	}}}}
	pdf, n, err := buildPDF(spec, nil)
	if err != nil || n != 1 {
		t.Fatalf("build: %v %d", err, n)
	}
	im := renderPDF(t, pdf)
	b := im.Bounds()
	if top := im.At(b.Dx()/2, b.Dy()/8); !isRed(top) {
		t.Fatalf("top should be red, got %v", top)
	}
	if bot := im.At(b.Dx()/2, b.Dy()*7/8); !isBlue(bot) {
		t.Fatalf("bottom should be blue, got %v", bot)
	}

	// 자르기: 아래 절반을 가리면(clip 위쪽만) 아래는 흰색
	spec.Pages[0].Ops[0].Clip = []float64{0, 0, 100, 100}
	pdf, _, err = buildPDF(spec, nil)
	if err != nil {
		t.Fatal(err)
	}
	im = renderPDF(t, pdf)
	if bot := im.At(b.Dx()/2, b.Dy()*7/8); !isWhite(bot) {
		t.Fatalf("clipped bottom should be white, got %v", bot)
	}
}

func TestPDFLibraryPNGAndLines(t *testing.T) {
	var buf bytes.Buffer
	png.Encode(&buf, halves(30, 30))
	src := buf.Bytes()
	// 투명 PNG (곡 제목 글자처럼): 반은 투명
	alpha := image.NewNRGBA(image.Rect(0, 0, 10, 10))
	for y := 0; y < 10; y++ {
		for x := 0; x < 10; x++ {
			if x < 5 {
				alpha.Set(x, y, color.NRGBA{0, 0, 0, 255})
			}
		}
	}
	var abuf bytes.Buffer
	png.Encode(&abuf, alpha)
	calls := 0
	spec := &PrintSpec{Name: "t", W: 297, H: 210, Pages: []PrintPage{
		{Ops: []PrintOp{
			{Type: "image", ID: "s1", P: 0, Box: []float64{10, 10, 130, 130}},
			{Type: "image", ID: "s1", P: 0, Box: []float64{150, 10, 130, 130}},
			{Type: "line", Line: []float64{148.5, 10, 148.5, 200}, Width: 0.3, Gray: 0.6},
			{Type: "image", Data: base64.StdEncoding.EncodeToString(abuf.Bytes()), Box: []float64{140, 195, 10, 10}},
		}},
		{Ops: []PrintOp{{Type: "image", ID: "s1", P: 0, Box: []float64{10, 10, 100, 100}}}},
	}}
	pdf, n, err := buildPDF(spec, func(id string, p int) ([]byte, error) { calls++; return src, nil })
	if err != nil || n != 2 {
		t.Fatalf("build: %v %d", err, n)
	}
	if calls != 1 {
		t.Fatalf("same picture should be read once, read %d times", calls)
	}
	if bytes.Count(pdf, []byte("/Subtype /Image")) != 3 { // 악보 1 + 글자 1 + 글자 투명도 1
		t.Fatalf("expected 3 image objects")
	}
	im := renderPDF(t, pdf)
	b := im.Bounds()
	if c := im.At(b.Dx()*30/297, b.Dy()*70/210); !isRed(c) {
		t.Fatalf("left sheet should start red, got %v", c)
	}
	if c := im.At(b.Dx()*5/297, b.Dy()*5/210); !isWhite(c) {
		t.Fatalf("margin should be white, got %v", c)
	}
}

func TestSafePDFName(t *testing.T) {
	cases := map[string]string{"이번 주 예배": "이번 주 예배.pdf", "a/b:c": "a b c.pdf", "": "MSROAD 악보.pdf", "x.pdf": "x.pdf", "../../etc": "MSROAD 악보.pdf"}
	for in, want := range cases {
		got := safePDFName(in)
		if in == "../../etc" {
			if got == "../../etc.pdf" || filepath.Base(got) != got {
				t.Fatalf("unsafe: %q", got)
			}
			continue
		}
		if got != want {
			t.Fatalf("%q → %q, want %q", in, got, want)
		}
	}
}
