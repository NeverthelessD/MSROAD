package main

// 썸네일 · 미리보기 변환
// macOS 기본 도구 sips 로 작은 미리보기(JPEG)를 만들고, HEIC 는 브라우저가 못 읽으니 JPEG 로 바꿔서 보여 줘요.
// 만든 파일은 Application Support/MSROAD/cache 에 보관합니다.

import (
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"sync"
	"time"
)

const thumbSize = 640

type Thumbs struct {
	dir     string
	sem     chan struct{}
	mu      sync.Mutex
	pending map[string]*sync.WaitGroup
	hasSips bool
}

func NewThumbs(support string) *Thumbs {
	t := &Thumbs{dir: filepath.Join(support, "cache"), sem: make(chan struct{}, max(2, min(6, runtime.NumCPU()))), pending: map[string]*sync.WaitGroup{}}
	os.MkdirAll(filepath.Join(t.dir, "thumb"), 0o755)
	os.MkdirAll(filepath.Join(t.dir, "full"), 0o755)
	_, err := os.Stat("/usr/bin/sips")
	t.hasSips = err == nil && os.Getenv("MSROAD_NO_SIPS") == ""
	go t.prune()
	return t
}

// 90일 넘게 안 쓴 캐시는 지워요.
func (t *Thumbs) prune() {
	defer recoverLog("prune")
	time.Sleep(30 * time.Second)
	cut := time.Now().Add(-90 * 24 * time.Hour)
	for _, sub := range []string{"thumb", "full"} {
		ents, _ := os.ReadDir(filepath.Join(t.dir, sub))
		for _, e := range ents {
			if info, err := e.Info(); err == nil && info.ModTime().Before(cut) {
				os.Remove(filepath.Join(t.dir, sub, e.Name()))
			}
		}
	}
}

// 파일 이름을 바꿔도 다시 만들지 않도록, 내용(크기·수정 시각·형식)으로 이름을 정해요.
func cacheKey(p *Page) string {
	h := sha1.Sum([]byte(strconv.FormatInt(p.Size, 10) + "|" + strconv.FormatInt(p.Mod, 10) + "|" + p.Ext))
	return hex.EncodeToString(h[:])[:20]
}

func (t *Thumbs) make(kind string, p *Page) (string, error) {
	out := filepath.Join(t.dir, kind, cacheKey(p)+".jpg")
	if st, err := os.Stat(out); err == nil && st.Size() > 0 {
		now := time.Now()
		os.Chtimes(out, now, now)
		return out, nil
	}
	goMade := false
	if !t.hasSips {
		// sips 가 없으면(Windows) JPEG · PNG · GIF 작은 미리보기만 Go 로 만들어요. 나머지는 원본을 그대로 보여 줘요.
		switch p.Ext {
		case ".jpg", ".jpeg", ".png", ".gif":
			if kind != "thumb" {
				return "", errors.New("no converter")
			}
			goMade = true
		default:
			return "", errors.New("no converter")
		}
	}
	// 같은 파일을 동시에 두 번 만들지 않게
	t.mu.Lock()
	if wg, ok := t.pending[out]; ok {
		t.mu.Unlock()
		wg.Wait()
		if fileExists(out) {
			return out, nil
		}
		return "", errors.New("convert failed")
	}
	wg := &sync.WaitGroup{}
	wg.Add(1)
	t.pending[out] = wg
	t.mu.Unlock()
	defer func() {
		t.mu.Lock()
		delete(t.pending, out)
		t.mu.Unlock()
		wg.Done()
	}()

	t.sem <- struct{}{}
	defer func() { <-t.sem }()
	tmp := out + ".part.jpg"
	if goMade {
		if err := goThumb(p.path, tmp, thumbSize); err != nil {
			os.Remove(tmp)
			return "", err
		}
		if err := os.Rename(tmp, out); err != nil {
			return "", err
		}
		return out, nil
	}
	args := []string{"-s", "format", "jpeg"}
	if kind == "thumb" {
		args = append(args, "-s", "formatOptions", "78", "-Z", strconv.Itoa(thumbSize))
	} else {
		args = append(args, "-s", "formatOptions", "92")
	}
	args = append(args, p.path, "--out", tmp)
	cmd := exec.Command("/usr/bin/sips", args...)
	if b, err := cmd.CombinedOutput(); err != nil || !fileExists(tmp) {
		os.Remove(tmp)
		return "", fmt.Errorf("sips: %v %s", err, lastLine(string(b)))
	}
	if err := os.Rename(tmp, out); err != nil {
		return "", err
	}
	return out, nil
}

var browserImage = map[string]string{".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"}

// serveThumb: 작은 미리보기. 만들 수 없으면 브라우저가 읽을 수 있는 원본을 그대로 보내요.
func (t *Thumbs) serveThumb(w http.ResponseWriter, r *http.Request, p *Page) {
	if out, err := t.make("thumb", p); err == nil {
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Header().Set("Content-Type", "image/jpeg")
		http.ServeFile(w, r, out)
		return
	}
	if ct, ok := browserImage[p.Ext]; ok {
		t.serveOriginal(w, r, p, ct)
		return
	}
	http.Error(w, "no preview", http.StatusUnsupportedMediaType)
}

// serveFull: 크게 보기. HEIC 는 JPEG 로 바꿔서, 나머지는 원본 그대로.
func (t *Thumbs) serveFull(w http.ResponseWriter, r *http.Request, p *Page) {
	switch p.Kind {
	case "heic":
		out, err := t.make("full", p)
		if err != nil {
			http.Error(w, "HEIC 파일을 열지 못했어요", http.StatusUnsupportedMediaType)
			return
		}
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "private, max-age=86400")
		http.ServeFile(w, r, out)
	case "pdf":
		t.serveOriginal(w, r, p, "application/pdf")
	default:
		t.serveOriginal(w, r, p, browserImage[p.Ext])
	}
}

func (t *Thumbs) serveOriginal(w http.ResponseWriter, r *http.Request, p *Page, ct string) {
	f, err := os.Open(p.path)
	if err != nil {
		http.Error(w, "파일을 찾을 수 없어요", http.StatusNotFound)
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		http.Error(w, "파일을 읽지 못했어요", http.StatusInternalServerError)
		return
	}
	if ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeContent(w, r, "", st.ModTime(), f)
}
