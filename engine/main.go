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
	"runtime/debug"
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
	sets   *SetStore

	lastVis  atomic.Int64 // 화면에 보이는 창이 마지막으로 연락한 시각 (같은 시계)
	lastSeen atomic.Int64 // 마지막 요청 시각 (started 기준 경과 ns, 잠자기 동안은 멈춰 있는 시계)
	scanMu   sync.Mutex
}

var app *App

// started 는 단조 시계 기준점이에요. time.Since(started) 는 맥이 잠자는 동안 늘어나지 않아서,
// 뚜껑을 닫았다 열어도 엔진이 "오래 쉬었다"고 착각해 꺼지지 않아요.
var started = time.Now()

func touch() { app.lastSeen.Store(int64(time.Since(started))) }

// 창이 열려 있어도 Chrome이 뒤에 있는 창을 잠시 멈추게 할 수 있어서 넉넉하게 기다려요.
const idleLimit = 90 * time.Minute

func env(k string) string { return os.Getenv("MSROAD_" + k) }

// envArgs: 백그라운드 도우미 앱으로 켜질 때는 환경 변수를 넘길 수 없어서 `--env MSROAD_X=값` 으로 받아요.
func envArgs() {
	for i := 1; i+1 < len(os.Args); i++ {
		if os.Args[i] == "--env" {
			if k, v, ok := strings.Cut(os.Args[i+1], "="); ok && strings.HasPrefix(k, "MSROAD_") {
				os.Setenv(k, v)
			}
			i++
		}
	}
}

func main() {
	// Windows: MSROAD.exe 하나가 실행기와 엔진을 겸해요 (더블클릭 → 실행기, --engine → 엔진)
	if launcherMode() {
		runLauncher()
		return
	}
	envArgs()
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
	if env("SUPERVISOR") == "1" {
		os.MkdirAll(support, 0o755)
		runSupervisor(support)
		return
	}
	token := env("TOKEN")
	if token == "" {
		token = randID(16)
	}
	app = &App{support: support, token: token}
	os.MkdirAll(support, 0o755)
	os.Rename(filepath.Join(support, "engine.log"), filepath.Join(support, "engine.prev.log"))
	if f, err := os.OpenFile(filepath.Join(support, "engine.log"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644); err == nil {
		log.SetOutput(io.MultiWriter(os.Stderr, f))
	}
	app.loadSettings()
	touch()
	app.lib = NewLibrary(support)
	app.thumbs = NewThumbs(support)
	app.rn = &Renamer{}
	app.upd = NewUpdater(support)
	app.sets = NewSetStore(support)
	go func() { defer recoverLog("startup scan"); app.rescan() }()

	go heartbeat(support)
	ln := listen(env("PORT"), env("PORT_WAIT") == "1")
	app.port = ln.Addr().(*net.TCPAddr).Port
	writeFileAtomic(filepath.Join(support, "token"), []byte(token), 0o600)
	writeFileAtomic(filepath.Join(support, "port"), []byte(strconv.Itoa(app.port)), 0o644)
	// lastport 는 지우지 않아요. 엔진이 꺼진 뒤 앱을 다시 열면 같은 주소로 켜져서, 열려 있던 창이 그대로 이어져요.
	writeFileAtomic(filepath.Join(support, "lastport"), []byte(strconv.Itoa(app.port)), 0o644)
	log.Printf("MSROAD %s listening on %d (pid %d, 지킴이 %v)", build, app.port, os.Getpid(), env("CHILD") == "1")

	// 다른 주소에서 켜졌더라도 진단 페이지만은 늘 47917 에서 볼 수 있게 해요
	if app.port != defaultPort {
		go func() {
			defer recoverLog("diag listener")
			if ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", defaultPort)); err == nil {
				m := http.NewServeMux()
				m.HandleFunc("/diag", app.handleDiag)
				http.Serve(ln, hostGuard(m))
			}
		}()
	}
	go app.idleWatcher()
	go app.watchParent()
	go func() { defer recoverLog("autoLoop"); app.upd.autoLoop() }()
	srv := &http.Server{Handler: hostGuard(recordRequests(app.routes())), ErrorLog: log.Default()}
	log.Fatal(srv.Serve(ln))
}

// defaultPort: 항상 같은 주소를 쓰면 엔진이 다시 켜져도 열려 있던 창이 이어지고, 진단 페이지도 찾기 쉬워요.
// 다른 프로그램이 쓰고 있으면 빈 포트를 골라요.
const defaultPort = 47917

func listen(pref string, wait bool) net.Listener {
	p, err := strconv.Atoi(pref)
	if err != nil || p <= 0 {
		p = defaultPort
	}
	tries := 1
	if wait { // 다시 시작할 때는 이전 엔진이 주소를 놓을 때까지 잠깐 기다려요
		tries = 20
	}
	for i := 0; i < tries; i++ {
		if ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p)); err == nil {
			return ln
		}
		time.Sleep(150 * time.Millisecond)
	}
	if p != defaultPort {
		if ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", defaultPort)); err == nil {
			return ln
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

// 창을 닫고 오랫동안(잠자기 시간은 빼고) 아무 요청이 없으면 스스로 종료합니다.
func (a *App) idleWatcher() {
	defer recoverLog("idleWatcher")
	// Dock 앱(MSROAD.app)이 켠 엔진은 앱이 켜져 있는 동안 계속 켜 둬요. 앱을 종료하면 엔진도 함께 꺼져요.
	if nativeShell() {
		return
	}
	for range time.Tick(15 * time.Second) {
		idle := time.Since(started) - time.Duration(a.lastSeen.Load())
		if idle > idleLimit && !a.upd.Busy() {
			log.Printf("idle for %s, shutting down", idle.Round(time.Second))
			a.shutdownWhy("오래 쉼")
		}
	}
}

func (a *App) shutdown() { a.shutdownWhy("종료") }

// nativeShell: Dock 에 보이는 맥 앱(app/shell/main.swift)이 엔진을 켰는지
func nativeShell() bool { return env("SHELL") == "native" }

// watchParent: 지킴이(부모)가 사라지면 엔진도 끝나요 — 혼자 남아 몰래 돌지 않게
func (a *App) watchParent() {
	if env("CHILD") != "1" {
		return
	}
	ppid := os.Getppid()
	for range time.Tick(2 * time.Second) {
		if os.Getppid() != ppid {
			a.shutdownWhy("지킴이가 사라짐")
		}
	}
}

func (a *App) shutdownWhy(why string) {
	log.Printf("shutdown: %s", why)
	markCleanExit(a.support, why)
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
	s := a.settings
	s.UI = make(map[string]any, len(a.settings.UI))
	for k, v := range a.settings.UI {
		s.UI[k] = v
	}
	s.Recent = append([]string(nil), a.settings.Recent...)
	return s
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
		"os":         uiOS(),
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

	mux.HandleFunc("/diag", a.handleDiag)

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
			touch()
			if r.URL.Query().Get("vis") == "1" {
				a.lastVis.Store(int64(time.Since(started)))
			}
			defer func() {
				if v := recover(); v != nil {
					log.Printf("PANIC in %s: %v\n%s", path, v, debug.Stack())
					jsonError(w, 500, "앱 안에서 문제가 생겼어요. 다시 시도해 주세요 (설정 → 문제 기록에 남았어요)")
				}
			}()
			h(w, r)
		})
	}

	api("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ok": true, "build": build, "shell": env("SHELL")})
	})
	api("/api/quit", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ok": true})
		go func() { time.Sleep(300 * time.Millisecond); a.shutdownWhy("종료 버튼") }()
	})
	// 화면에서 생긴 문제를 받아 적어요 (진단용)
	api("/api/clientlog", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Items []string `json:"items"`
		}
		readJSON(r, &in)
		for i, x := range in.Items {
			if i >= 30 {
				break
			}
			if len(x) > 600 {
				x = x[:600]
			}
			diag.clientErr(x)
			log.Printf("client: %s", x)
		}
		writeJSON(w, map[string]any{"ok": true})
	})
	api("/api/poll", func(w http.ResponseWriter, r *http.Request) {
		canUndo, undoDesc := a.rn.CanUndo()
		writeJSON(w, map[string]any{"build": build, "rev": a.lib.Rev(), "update": a.upd.State(), "canUndo": canUndo, "undoDesc": undoDesc, "shell": env("SHELL")})
	})
	// 실행기가 묻는 곳: 화면에 보이는 창이 방금 다시 이어졌나요? (그러면 새 창을 또 열지 않아요)
	api("/api/attached", func(w http.ResponseWriter, r *http.Request) {
		v := a.lastVis.Load()
		writeJSON(w, map[string]any{"ok": true, "visible": v > 0 && time.Since(started)-time.Duration(v) < 3*time.Second})
	})
	api("/api/crash", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ok": true, "report": crashReport(a.support)})
	})
	api("/api/library", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, a.lib.Snapshot())
	})
	api("/api/rescan", func(w http.ResponseWriter, r *http.Request) {
		changed := a.rescan()
		added, removed := a.lib.LastChange()
		writeJSON(w, map[string]any{"ok": true, "changed": changed, "rev": a.lib.Rev(), "added": added, "removed": removed, "newTotal": a.lib.NewCount()})
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
	// 편집 · 인쇄
	api("/api/sets", a.handleSets)
	api("/api/sets/save", a.handleSetSave)
	api("/api/sets/delete", a.handleSetDelete)
	api("/api/presets", a.handlePresets)
	api("/api/print/pdf", a.handlePrintPDF)
	api("/api/print/open", a.handlePrintOpen)
	api("/api/print/save", a.handlePrintSave)
	api("/api/reveal-file", a.handleRevealFile)
	api("/api/print/file", a.handlePrintFile)
	api("/api/fs/list", a.handleFsList)
	api("/api/fs/mkdir", a.handleFsMkdir)
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
		go func() { defer recoverLog("install"); a.upd.Install() }()
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
	if len(paths) > 0 {
		if dirExists(paths[0]) {
			openPaths(paths[:1])
		} else {
			revealPaths(paths)
		}
	}
	writeJSON(w, map[string]any{"ok": true})
}

func (a *App) handleOpenFile(w http.ResponseWriter, r *http.Request) {
	if paths := a.filesOf(r); len(paths) > 0 {
		openPaths(paths)
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

func recoverLog(where string) {
	if v := recover(); v != nil {
		log.Printf("PANIC in %s: %v\n%s", where, v, debug.Stack())
	}
}

// crashReport: 지난번 엔진이 갑자기 멈췄다면 그 기록(engine.prev.out)과 이번 기록의 문제 부분을 돌려줘요.
func crashReport(support string) string {
	var parts []string
	if b, err := os.ReadFile(filepath.Join(support, "engine.prev.out")); err == nil {
		t := string(b)
		if strings.Contains(t, "panic") || strings.Contains(t, "fatal error") || strings.Contains(t, "PANIC") {
			if len(t) > 6000 {
				t = t[len(t)-6000:]
			}
			parts = append(parts, "[지난번 실행]\n"+t)
		}
	}
	if b, err := os.ReadFile(filepath.Join(support, "engine.log")); err == nil {
		t := string(b)
		if i := strings.Index(t, "PANIC"); i >= 0 {
			t = t[i:]
			if len(t) > 6000 {
				t = t[:6000]
			}
			parts = append(parts, "[이번 실행]\n"+t)
		}
	}
	return strings.Join(parts, "\n\n")
}
