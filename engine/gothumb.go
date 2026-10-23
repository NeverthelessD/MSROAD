package main

// sips 가 없는 곳(Windows)에서 JPEG · PNG · GIF 작은 미리보기를 Go 로 만들어요.
// 휴대폰 사진의 회전 정보(EXIF)도 따라서 바로 세워 줘요.

import (
	"bytes"
	"image"
	"image/draw"
	"image/jpeg"
	"os"
)

func goThumb(src, out string, size int) error {
	b, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	im, _, err := image.Decode(bytes.NewReader(b))
	if err != nil {
		return err
	}
	orient := 1
	if len(b) > 3 && b[0] == 0xFF && b[1] == 0xD8 {
		orient = exifOrientation(b)
	}
	small := shrink(im, size)
	small = applyOrientation(small, orient)
	f, err := os.Create(out)
	if err != nil {
		return err
	}
	if err := jpeg.Encode(f, small, &jpeg.Options{Quality: 80}); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

// shrink: 긴 쪽이 size 가 되도록 줄여요 (여러 픽셀을 평균 — 글자 · 오선이 깨지지 않게)
func shrink(src image.Image, size int) *image.RGBA {
	r := src.Bounds()
	w, h := r.Dx(), r.Dy()
	rgba := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(rgba, rgba.Bounds(), image.White, image.Point{}, draw.Src)
	draw.Draw(rgba, rgba.Bounds(), src, r.Min, draw.Over)
	long := max(w, h)
	if long <= size {
		return rgba
	}
	nw, nh := max(1, w*size/long), max(1, h*size/long)
	dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
	for y := 0; y < nh; y++ {
		y0, y1 := y*h/nh, max(y*h/nh+1, (y+1)*h/nh)
		for x := 0; x < nw; x++ {
			x0, x1 := x*w/nw, max(x*w/nw+1, (x+1)*w/nw)
			var sr, sg, sb, n int
			for yy := y0; yy < y1; yy++ {
				i := yy*rgba.Stride + x0*4
				for xx := x0; xx < x1; xx++ {
					sr += int(rgba.Pix[i])
					sg += int(rgba.Pix[i+1])
					sb += int(rgba.Pix[i+2])
					i += 4
					n++
				}
			}
			j := y*dst.Stride + x*4
			dst.Pix[j], dst.Pix[j+1], dst.Pix[j+2], dst.Pix[j+3] = uint8(sr/n), uint8(sg/n), uint8(sb/n), 255
		}
	}
	return dst
}

// applyOrientation turns a stored image upright according to its EXIF orientation (1~8).
func applyOrientation(src *image.RGBA, o int) *image.RGBA {
	if o <= 1 || o > 8 {
		return src
	}
	w, h := src.Bounds().Dx(), src.Bounds().Dy()
	dw, dh := w, h
	if o >= 5 {
		dw, dh = h, w
	}
	dst := image.NewRGBA(image.Rect(0, 0, dw, dh))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			var dx, dy int
			switch o {
			case 2:
				dx, dy = w-1-x, y
			case 3:
				dx, dy = w-1-x, h-1-y
			case 4:
				dx, dy = x, h-1-y
			case 5:
				dx, dy = y, x
			case 6:
				dx, dy = h-1-y, x
			case 7:
				dx, dy = h-1-y, w-1-x
			case 8:
				dx, dy = y, w-1-x
			}
			si, di := y*src.Stride+x*4, dy*dst.Stride+dx*4
			copy(dst.Pix[di:di+4], src.Pix[si:si+4])
		}
	}
	return dst
}
