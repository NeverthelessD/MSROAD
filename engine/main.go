// MSROAD — 악보 분류 · 미리보기 (macOS, Apple Silicon)
// made by. Nevertheless_D
package main

import (
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// build is the app version, set with -ldflags "-X main.build=1.2.3".
var build = "0.0.0-dev"

//go:embed web
var webFiles embed.FS

type Settings struct {
	Appearance string         `json:"appearance"` // system | light | dark
	Folder     string         `json:"folder"`     // 지금 보고 있는 악보 폴더
	Recent     []string       `json:"recent"`     // 최근 폴더
	Subfolders bool           `json:"subfolders"` // 하위 폴더까지 읽기
	AutoUpdate bool           `json:"autoUpdate"`
	UI         map[string]any `json:"ui"`
}

type App struct {
	support string
	token   string
	port    int

	mu       sync.Mutex
	settings Settings

	lib    *Library
	thumbs *Thumbs
	rn     *Renamer
	upd    *Updater

	lastSeen atomic.Int64
	scanMu   sync.Mutex
}

var app *App

func env(k string) string { return os.Getenv("MSROAD_" + k) }

func main() {
	log.SetFlags(log.LstdFlags)
	home, _ := os.UserHomeDir()
	support := env("SUPPORT")
	if support == "" {
		switch runtime.GOOS {
		case "darwin":
			support = filepath.Join(home, "Library", "Application Support", "MSROAD")
		case "windows":
			support = filepath.Join(os.Getenv("LOCALAPPDATA"), "MSROAD")
		default:
			support = filepath.Join(home, ".msroad")
		}
	}
	token := env("TOKEN")
	if token == "" {
		token = randID(16)
	}
	app = &App{support: support, token: token}
	os.MkdirAll(support, 0o755)
	if f, err := os.OpenFile(filepath.Join(support, "engine.log"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644); err == nil {
		log.SetOutput(io.MultiWriter(os.Stderr, f))
	}
	app.loadSettings()
	app.lastSeen.Store(time.Now().Unix())
	app.lib = NewLibrary()
	app.thumbs = NewThumbs(support)
	app.rn = &Renamer{}
	app.upd = NewUpdater(support)
	go app.rescan()

	ln := listen(env("PORT"))
	app.port = ln.Addr().(*net.TCPAddr).Port
	writeFileAtomic(filepath.Join(support, "token"), []byte(token), 0o600)
	writeFileAtomic(filepath.Join(support, "port"), []byte(strconv.Itoa(app.port)), 0o644)
	log.Printf("MSROAD %s listening on %d", build, app.port)

	go app.idleWatcher()
	go app.upd.autoLoop()
	srv := &http.Server{Handler: hostGuard(app.routes())}
	log.Fatal(srv.Serve(ln))
}

func listen(pref string) net.Listener {
	if p, err := strconv.Atoi(pref); err == nil && p > 0 {
		for i := 0; i < 20; i++ {
			if ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p)); err == nil {
				return ln
			}
			time.Sleep(150 * time.Millisecond)
		}
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	return ln
}

func (a *App) rescan() bool {
	a.scanMu.Lock()
	defer a.scanMu.Unlock()
	s := a.Settings()
	return a.lib.Scan(s.Folder, s.Subfolders)
}

// ---------------------------------------------------------------- lifecycle

// 창을 닫고 10분 동안 아무 요청이 없으면 스스로 종료합니다.
func (a *App) idleWatcher() {
	for range time.Tick(15 * time.Second) {
		idle := time.Now().Unix() - a.lastSeen.Load()
		if idle > 600 && !a.upd.Busy() {
			a.shutdown()
		}
	}
}

func (a *App) shutdown() {
	if b, err := os.ReadFile(filepath.Join(a.support, "port")); err == nil && string(b) == strconv.Itoa(a.port) {
		os.Remove(filepath.Join(a.support, "port"))
	}
	os.Exit(0)
}

// ---------------------------------------------------------------- settings

func (a *App) settingsPath() string { return filepath.Join(a.support, "settings.json") }

func (a *App) loadSettings() {
	a.settings = Settings{Appearance: "system", Subfolders: true, AutoUpdate: true, UI: map[string]any{}}
	if b, err := os.ReadFile(a.settingsPath()); err == nil {
		_ = json.Unmarshal(b, &a.settings)
	}
	if a.settings.UI == nil {
		a.settings.UI = map[string]any{}
	}
}

func (a *App) saveSettings() {
	b, _ := json.MarshalIndent(a.settings, "", "  ")
	writeFileAtomic(a.settingsPath(), b, 0o644)
}

func (a *App) Settings() Settings {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.settings
}

func (a *App) settingsJSON() map[string]any {
	s := a.Settings()
	recent := []map[string]any{}
	for _, r := range s.Recent {
		recent = append(recent, map[string]any{"path": r, "name": composeHangul(filepath.Base(r)), "exists": dirExists(r)})
	}
	home, _ := os.UserHomeDir()
	return map[string]any{
		"appearance": s.Appearance,
		"folder":     s.Folder,
		"recent":     recent,
		"subfolders": s.Subfolders,
		"autoUpdate": s.AutoUpdate,
		"ui":         s.UI,
		"home":       home,
		"build":      build,
		"platform":   runtime.GOOS + "/" + runtime.GOARCH,
	}
}

func (a *App) setFolder(p string) {
	a.mu.Lock()
	a.settings.Folder = p
	if p != "" {
		rec := []string{p}
		for _, r := range a.settings.Recent {
			if r != p && len(rec) < 6 {
				rec = append(rec, r)
			}
		}
		a.settings.Recent = rec
	}
	a.saveSettings()
	a.mu.Unlock()
}

// ---------------------------------------------------------------- routes

func (a *App) routes() http.Handler {
	mux := http.NewServeMux()
	sub, _ := fs.Sub(webFiles, "web")
	static := http.FileServer(http.FS(sub))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			if r.URL.Query().Get("t") != a.token {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.WriteHeader(http.StatusForbidden)
				io.WriteString(w, "<meta charset=utf-8><body style='font:15px -apple-system;padding:40px'>MSROAD 앱을 다시 실행해 주세요.</body>")
				return
			}
			b, _ := webFiles.ReadFile("web/index.html")
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			w.Write(b)
			return
		}
		if strings.HasSuffix(r.URL.Path, ".js") || strings.HasSuffix(r.URL.Path, ".css") {
			w.Header().Set("Cache-Control", "no-cache")
		} else if strings.HasPrefix(r.URL.Path, "/vendor/") || strings.HasPrefix(r.URL.Path, "/fonts/") {
			w.Header().Set("Cache-Control", "public, max-age=604800")
		}
		static.ServeHTTP(w, r)
	})

	api := func(path string, h http.HandlerFunc) {
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			t := r.Header.Get("x-token")
			if t == "" {
				t = r.URL.Query().Get("t")
			}
			if t != a.token {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			a.lastSeen.Store(time.Now().Unix())
			h(w, r)
		})
	}

	api("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ok": true, "build": build})
	})
	api("/api/quit", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ok": true})
		go func() { time.Sleep(300 * time.Millisecond); a.shutdown() }()
	})
	api("/api/poll", func(w http.ResponseWriter, r *http.Request) {
		canUndo, undoDesc := a.rn.CanUndo()
		writeJSON(w, map[string]any{"build": build, "rev": a.lib.Rev(), "update": a.upd.State(), "canUndo": canUndo, "undoDesc": undoDesc})
	})
	api("/api/library", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, a.lib.Snapshot())
	})
	api("/api/rescan", func(w http.ResponseWriter, r *http.Request) {
		changed := a.rescan()
		writeJSON(w, map[string]any{"ok": true, "changed": changed, "rev": a.lib.Rev()})
	})
	api("/api/settings", a.handleSettings)
	api("/api/folder", a.handleFolder)
	api("/api/choose-folder", a.handleChooseFolder)
	api("/api/reveal", a.handleReveal)
	api("/api/open-file", a.handleOpenFile)
	api("/api/thumb", func(w http.ResponseWriter, r *http.Request) {
		if p := a.pageFor(w, r); p != nil {
			a.thumbs.serveThumb(w, r, p)
		}
	})
	api("/api/file", func(w http.ResponseWriter, r *http.Request) {
		if p := a.pageFor(w, r); p != nil {
			a.thumbs.serveFull(w, r, p)
		}
	})
	api("/api/assign", a.handleAssign)
	api("/api/undo", func(w http.ResponseWriter, r *http.Request) {
		if err := a.rn.Undo(); err != nil {
			jsonError(w, 400, err.Error())
			return
		}
		a.rescan()
		writeJSON(w, map[string]any{"ok": true, "rev": a.lib.Rev()})
	})

	api("/api/update/check", func(w http.ResponseWriter, r *http.Request) {
		a.upd.Check(true)
		writeJSON(w, a.upd.State())
	})
	api("/api/update/install", func(w http.ResponseWriter, r *http.Request) {
		go a.upd.Install()
		writeJSON(w, map[string]any{"ok": true})
	})
	api("/api/update/rollback", func(w http.ResponseWriter, r *http.Request) {
		if err := a.upd.Rollback(); err != nil {
			jsonError(w, 500, err.Error())
			return
		}
		writeJSON(w, map[string]any{"ok": true})
	})
	api("/api/update/restart", func(w http.ResponseWriter, r *http.Request) {
		if err := a.upd.Restart(a.port, a.token); err != nil {
			jsonError(w, 500, err.Error())
			return
		}
		writeJSON(w, map[string]any{"ok": true})
	})
	return mux
}

// Only answer requests addressed to 127.0.0.1 / localhost (DNS rebinding protection).
func hostGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if host != "127.0.0.1" && host != "localhost" {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *App) pageFor(w http.ResponseWriter, r *http.Request) *Page {
	idx, _ := strconv.Atoi(r.URL.Query().Get("p"))
	p, ok := a.lib.page(r.URL.Query().Get("id"), idx)
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return nil
	}
	return p
}

func (a *App) handleSettings(w http.ResponseWriter, r *http.Request) {
	rescan := false
	if r.Method == http.MethodPost {
		var in map[string]json.RawMessage
		if err := readJSON(r, &in); err != nil {
			jsonError(w, 400, "bad request")
			return
		}
		a.mu.Lock()
		for k, v := range in {
			switch k {
			case "appearance":
				json.Unmarshal(v, &a.settings.Appearance)
			case "autoUpdate":
				json.Unmarshal(v, &a.settings.AutoUpdate)
			case "subfolders":
				json.Unmarshal(v, &a.settings.Subfolders)
				rescan = true
			case "forgetRecent":
				var p string
				json.Unmarshal(v, &p)
				rec := []string{}
				for _, x := range a.settings.Recent {
					if x != p {
						rec = append(rec, x)
					}
				}
				a.settings.Recent = rec
			case "ui":
				var ui map[string]any
				if json.Unmarshal(v, &ui) == nil {
					for kk, vv := range ui {
						a.settings.UI[kk] = vv
					}
				}
			}
		}
		a.saveSettings()
		a.mu.Unlock()
	}
	if rescan {
		a.rescan()
	}
	writeJSON(w, a.settingsJSON())
}

// POST {path} — 악보 폴더 바꾸기 ("" = 닫기)
func (a *App) handleFolder(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Path string `json:"path"`
	}
	readJSON(r, &in)
	if in.Path != "" && !dirExists(in.Path) {
		jsonError(w, 400, "폴더를 찾을 수 없어요. 옮겼거나 이름이 바뀌었는지 확인해 주세요")
		return
	}
	a.setFolder(in.Path)
	a.rescan()
	out := a.settingsJSON()
	out["rev"] = a.lib.Rev()
	writeJSON(w, out)
}

func (a *App) handleAssign(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ID    string `json:"id"`
		Chord string `json:"chord"`
	}
	if err := readJSON(r, &in); err != nil {
		jsonError(w, 400, "bad request")
		return
	}
	if _, err := a.rn.Assign(a.lib, in.ID, in.Chord); err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	a.rescan()
	writeJSON(w, map[string]any{"ok": true, "rev": a.lib.Rev()})
}

// ---------------------------------------------------------------- OS helpers

func (a *App) handleChooseFolder(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Start  string `json:"start"`
		Prompt string `json:"prompt"`
	}
	readJSON(r, &in)
	if t := env("TEST_CHOOSE"); t != "" {
		writeJSON(w, map[string]any{"ok": true, "path": t})
		return
	}
	if runtime.GOOS != "darwin" {
		jsonError(w, 501, "macOS에서만 지원해요")
		return
	}
	start := in.Start
	if !dirExists(start) {
		start, _ = os.UserHomeDir()
	}
	prompt := in.Prompt
	if prompt == "" {
		prompt = "악보가 들어 있는 폴더를 골라 주세요"
	}
	script := []string{
		"on run argv",
		"activate",
		"try",
		"set f to choose folder with prompt (item 2 of argv) default location (POSIX file (item 1 of argv))",
		"return POSIX path of f",
		"on error number -128",
		"return \"\"",
		"end try",
		"end run",
	}
	args := []string{}
	for _, l := range script {
		args = append(args, "-e", l)
	}
	args = append(args, start, prompt)
	out, err := exec.Command("/usr/bin/osascript", args...).Output()
	if err != nil {
		jsonError(w, 500, "폴더 선택 창을 열지 못했어요")
		return
	}
	p := strings.TrimSpace(string(out))
	if p != "/" {
		p = strings.TrimSuffix(p, "/")
	}
	writeJSON(w, map[string]any{"ok": true, "path": p})
}

func (a *App) filesOf(r *http.Request) []string {
	var in struct {
		ID   string `json:"id"`
		Page int    `json:"page"`
		All  bool   `json:"all"`
	}
	readJSON(r, &in)
	if in.ID == "" {
		if root := a.lib.Root(); root != "" {
			return []string{root}
		}
		return nil
	}
	s, ok := a.lib.sheet(in.ID)
	if !ok || len(s.Pages) == 0 {
		return nil
	}
	if in.All {
		var out []string
		for _, p := range s.Pages {
			out = append(out, p.path)
		}
		return out
	}
	if in.Page < 0 || in.Page >= len(s.Pages) {
		in.Page = 0
	}
	return []string{s.Pages[in.Page].path}
}

func (a *App) handleReveal(w http.ResponseWriter, r *http.Request) {
	paths := a.filesOf(r)
	if runtime.GOOS == "darwin" && len(paths) > 0 {
		if dirExists(paths[0]) {
			exec.Command("/usr/bin/open", paths[0]).Start()
		} else {
			exec.Command("/usr/bin/open", append([]string{"-R"}, paths...)...).Start()
		}
	}
	writeJSON(w, map[string]any{"ok": true})
}

func (a *App) handleOpenFile(w http.ResponseWriter, r *http.Request) {
	paths := a.filesOf(r)
	if runtime.GOOS == "darwin" && len(paths) > 0 {
		exec.Command("/usr/bin/open", paths...).Start()
	}
	writeJSON(w, map[string]any{"ok": true})
}

// ---------------------------------------------------------------- utils

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(v)
}

func jsonError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": msg})
}

func readJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	return json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(v)
}

func randID(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func writeFileAtomic(path string, b []byte, perm os.FileMode) {
	tmp := path + ".tmp"
	if os.WriteFile(tmp, b, perm) == nil {
		os.Rename(tmp, path)
	}
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func dirExists(p string) bool {
	if p == "" {
		return false
	}
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

func lastLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	return strings.TrimSpace(lines[len(lines)-1])
}

func init() {
	mime.AddExtensionType(".js", "text/javascript")
	mime.AddExtensionType(".mjs", "text/javascript")
	mime.AddExtensionType(".bcmap", "application/octet-stream")
	mime.AddExtensionType(".pfb", "application/octet-stream")
}
