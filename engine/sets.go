package main

// 편집 · 인쇄: 세트(악보 배치) 저장, 자주 쓰는 틀, PDF 만들기 · 인쇄 · 저장
//
// 세트는 Support/sets/<id>.json 에 화면이 보낸 모양 그대로 저장해요 (원본 악보 파일은 건드리지 않아요).
// PDF 는 Support/print/ 에 만들고, 인쇄 · 저장은 앱 껍데기(맥 인쇄 창 · 저장 창)가 해요.
// 앱 껍데기가 없을 때(예전 창 · 시험)는 엔진이 '미리보기' 앱으로 열거나 저장 위치를 물어요.

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

var setIDRe = regexp.MustCompile(`^[a-z0-9]{6,40}$`)

type SetStore struct {
	mu  sync.Mutex
	dir string
}

func NewSetStore(support string) *SetStore {
	d := filepath.Join(support, "sets")
	os.MkdirAll(d, 0o755)
	return &SetStore{dir: d}
}

func (s *SetStore) List() ([]json.RawMessage, json.RawMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()
	type item struct {
		raw     json.RawMessage
		updated int64
	}
	var items []item
	ents, _ := os.ReadDir(s.dir)
	for _, e := range ents {
		name := e.Name()
		if !strings.HasSuffix(name, ".json") || !setIDRe.MatchString(strings.TrimSuffix(name, ".json")) {
			continue
		}
		b, err := os.ReadFile(filepath.Join(s.dir, name))
		if err != nil || !json.Valid(b) {
			continue
		}
		var meta struct {
			Updated int64 `json:"updated"`
		}
		json.Unmarshal(b, &meta)
		items = append(items, item{json.RawMessage(b), meta.Updated})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].updated > items[j].updated })
	out := make([]json.RawMessage, len(items))
	for i, it := range items {
		out[i] = it.raw
	}
	presets, err := os.ReadFile(filepath.Join(s.dir, "_presets.json"))
	if err != nil || !json.Valid(presets) {
		presets = nil
	}
	return out, presets
}

func (s *SetStore) Save(raw json.RawMessage) (string, int64, error) {
	if len(raw) > 4<<20 {
		return "", 0, errors.New("세트가 너무 커요")
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return "", 0, errors.New("세트 내용이 잘못됐어요")
	}
	id, _ := m["id"].(string)
	if !setIDRe.MatchString(id) {
		return "", 0, errors.New("세트 번호가 잘못됐어요")
	}
	now := time.Now().UnixMilli()
	m["updated"] = now
	b, _ := json.MarshalIndent(m, "", " ")
	s.mu.Lock()
	defer s.mu.Unlock()
	writeFileAtomic(filepath.Join(s.dir, id+".json"), b, 0o644)
	if !fileExists(filepath.Join(s.dir, id+".json")) {
		return "", 0, errors.New("세트를 저장하지 못했어요")
	}
	return id, now, nil
}

func (s *SetStore) Delete(id string) error {
	if !setIDRe.MatchString(id) {
		return errors.New("세트 번호가 잘못됐어요")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return os.Remove(filepath.Join(s.dir, id+".json"))
}

func (s *SetStore) SavePresets(raw json.RawMessage) error {
	if len(raw) > 256<<10 || !json.Valid(raw) {
		return errors.New("틀 목록이 잘못됐어요")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	writeFileAtomic(filepath.Join(s.dir, "_presets.json"), raw, 0o644)
	return nil
}

// ---------------------------------------------------------------- handlers

func (a *App) handleSets(w http.ResponseWriter, r *http.Request) {
	sets, presets := a.sets.List()
	if sets == nil {
		sets = []json.RawMessage{}
	}
	writeJSON(w, map[string]any{"ok": true, "sets": sets, "presets": presets})
}

func (a *App) handleSetSave(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Set json.RawMessage `json:"set"`
	}
	if err := readJSONLimit(r, &in, 6<<20); err != nil {
		jsonError(w, 400, "bad request")
		return
	}
	id, updated, err := a.sets.Save(in.Set)
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	writeJSON(w, map[string]any{"ok": true, "id": id, "updated": updated})
}

func (a *App) handleSetDelete(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ID string `json:"id"`
	}
	readJSON(r, &in)
	if err := a.sets.Delete(in.ID); err != nil && !os.IsNotExist(err) {
		jsonError(w, 400, err.Error())
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

func (a *App) handlePresets(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Presets json.RawMessage `json:"presets"`
	}
	if err := readJSON(r, &in); err != nil {
		jsonError(w, 400, "bad request")
		return
	}
	if err := a.sets.SavePresets(in.Presets); err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

func (a *App) printDir() string { return filepath.Join(a.support, "print") }

// resolvePrintImage returns bytes a PDF can hold for a library page (JPEG/PNG/GIF; HEIC · WEBP 는 JPEG 으로 바꿔서).
func (a *App) resolvePrintImage(id string, idx int) ([]byte, error) {
	p, ok := a.lib.page(id, idx)
	if !ok {
		return nil, errors.New("악보 파일을 찾지 못했어요. 폴더를 다시 읽어 보세요")
	}
	switch strings.ToLower(p.Ext) {
	case ".jpg", ".jpeg", ".png", ".gif":
		b, err := os.ReadFile(p.path)
		if err != nil {
			return nil, fmt.Errorf("%s 파일을 읽지 못했어요", p.Name)
		}
		return b, nil
	case ".pdf":
		return nil, errors.New("PDF 악보는 화면에서 그려서 보내야 해요")
	}
	out, err := a.thumbs.make("full", p)
	if err != nil {
		return nil, fmt.Errorf("%s 파일을 바꾸지 못했어요", p.Name)
	}
	return os.ReadFile(out)
}

var unsafeName = regexp.MustCompile(`[/\\:*?"<>|\x00-\x1f]+`)

func safePDFName(name string) string {
	name = strings.TrimSpace(unsafeName.ReplaceAllString(name, " "))
	name = strings.TrimSuffix(name, ".pdf")
	name = strings.TrimSuffix(name, ".PDF")
	if r := []rune(name); len(r) > 80 {
		name = string(r[:80])
	}
	if name == "" || strings.HasPrefix(name, ".") {
		name = "MSROAD 악보"
	}
	return name + ".pdf"
}

func (a *App) handlePrintPDF(w http.ResponseWriter, r *http.Request) {
	var spec PrintSpec
	if err := readJSONLimit(r, &spec, 400<<20); err != nil {
		jsonError(w, 400, "인쇄할 내용을 읽지 못했어요")
		return
	}
	pdf, pages, err := buildPDF(&spec, a.resolvePrintImage)
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	dir := a.printDir()
	os.MkdirAll(dir, 0o755)
	cleanPrintDir(dir, 12)
	name := safePDFName(spec.Name)
	sub := filepath.Join(dir, time.Now().Format("20060102-150405.000"))
	os.MkdirAll(sub, 0o755)
	path := filepath.Join(sub, name)
	if err := os.WriteFile(path, pdf, 0o644); err != nil {
		jsonError(w, 500, "PDF 를 만들지 못했어요")
		return
	}
	writeJSON(w, map[string]any{"ok": true, "path": path, "name": name, "pages": pages, "bytes": len(pdf)})
}

// cleanPrintDir keeps only the newest few print jobs.
func cleanPrintDir(dir string, keep int) {
	ents, _ := os.ReadDir(dir)
	var subs []string
	for _, e := range ents {
		if e.IsDir() {
			subs = append(subs, e.Name())
		}
	}
	sort.Strings(subs)
	for len(subs) > keep {
		os.RemoveAll(filepath.Join(dir, subs[0]))
		subs = subs[1:]
	}
}

// printFile checks that path is a PDF this engine made.
func (a *App) printFile(path string) (string, bool) {
	p, err := filepath.Abs(path)
	if err != nil {
		return "", false
	}
	dir, _ := filepath.Abs(a.printDir())
	if !strings.HasPrefix(p, dir+string(os.PathSeparator)) || !strings.HasSuffix(strings.ToLower(p), ".pdf") || !fileExists(p) {
		return "", false
	}
	return p, true
}

// handlePrintOpen: 앱 껍데기 없이 열린 경우의 인쇄 — 맥의 '미리보기' 앱으로 열어요.
func (a *App) handlePrintOpen(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Path string `json:"path"`
	}
	readJSON(r, &in)
	p, ok := a.printFile(in.Path)
	if !ok {
		jsonError(w, 400, "인쇄할 파일을 찾지 못했어요")
		return
	}
	if runtime.GOOS == "darwin" {
		if err := exec.Command("/usr/bin/open", "-a", "Preview", p).Start(); err != nil {
			exec.Command("/usr/bin/open", p).Start()
		}
	}
	// Windows: 화면이 이 주소를 새 창으로 열면 Edge · Chrome 의 PDF 보기에서 바로 인쇄할 수 있어요
	writeJSON(w, map[string]any{"ok": true, "url": "/api/print/file?path=" + url.QueryEscape(p) + "&t=" + a.token})
}

// handlePrintFile: 만든 PDF 를 브라우저 창으로 보여 줘요 (Windows 인쇄)
func (a *App) handlePrintFile(w http.ResponseWriter, r *http.Request) {
	p, ok := a.printFile(r.URL.Query().Get("path"))
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", "inline; filename*=UTF-8''"+url.PathEscape(filepath.Base(p)))
	w.Header().Set("Cache-Control", "no-store")
	http.ServeFile(w, r, p)
}

// handlePrintSave: 앱 껍데기 없이 열린 경우의 PDF 저장 — 저장 위치를 묻고 복사해요.
func (a *App) handlePrintSave(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Path string `json:"path"`
		Name string `json:"name"`
		Dir  string `json:"dir"` // Windows: 화면 안에서 고른 폴더
	}
	readJSON(r, &in)
	p, ok := a.printFile(in.Path)
	if !ok {
		jsonError(w, 400, "저장할 파일을 찾지 못했어요")
		return
	}
	name := safePDFName(in.Name)
	var dest string
	if in.Dir != "" {
		if !dirExists(in.Dir) {
			jsonError(w, 400, "저장할 폴더를 찾지 못했어요")
			return
		}
		dest = uniquePath(filepath.Join(in.Dir, name))
	} else if t := env("TEST_SAVE_DIR"); t != "" {
		dest = filepath.Join(t, name)
	} else if runtime.GOOS == "darwin" {
		home, _ := os.UserHomeDir()
		script := []string{
			"on run argv", "activate", "try",
			"set f to choose file name with prompt \"PDF를 저장할 곳을 골라 주세요\" default name (item 1 of argv) default location (POSIX file (item 2 of argv))",
			"return POSIX path of f", "on error number -128", "return \"\"", "end try", "end run",
		}
		args := []string{}
		for _, l := range script {
			args = append(args, "-e", l)
		}
		args = append(args, name, filepath.Join(home, "Desktop"))
		out, err := exec.Command("/usr/bin/osascript", args...).Output()
		if err != nil {
			jsonError(w, 500, "저장 창을 열지 못했어요")
			return
		}
		dest = strings.TrimSpace(string(out))
	} else {
		jsonError(w, 501, "macOS에서만 지원해요")
		return
	}
	if dest == "" {
		writeJSON(w, map[string]any{"ok": true, "canceled": true})
		return
	}
	if !strings.HasSuffix(strings.ToLower(dest), ".pdf") {
		dest += ".pdf"
	}
	if err := copyFile(p, dest); err != nil {
		jsonError(w, 500, "PDF 를 저장하지 못했어요")
		return
	}
	writeJSON(w, map[string]any{"ok": true, "dest": dest})
}

// handleRevealFile: 저장한 PDF 를 Finder 에서 보여 줘요.
func (a *App) handleRevealFile(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Path string `json:"path"`
	}
	readJSON(r, &in)
	if in.Path == "" || !fileExists(in.Path) {
		jsonError(w, 404, "파일을 찾지 못했어요")
		return
	}
	revealPaths([]string{in.Path})
	writeJSON(w, map[string]any{"ok": true})
}

// uniquePath: 같은 이름이 있으면 "이름 (2).pdf" 처럼 바꿔요 (덮어쓰지 않게)
func uniquePath(p string) string {
	if !fileExists(p) {
		return p
	}
	ext := filepath.Ext(p)
	base := strings.TrimSuffix(p, ext)
	for i := 2; i < 1000; i++ {
		q := fmt.Sprintf("%s (%d)%s", base, i, ext)
		if !fileExists(q) {
			return q
		}
	}
	return p
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".part"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, dst)
}

func readJSONLimit(r *http.Request, v any, limit int64) error {
	return json.NewDecoder(io.LimitReader(r.Body, limit)).Decode(v)
}
