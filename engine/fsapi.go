package main

// 앱 안에서 폴더 고르기 (Windows 에는 맥의 osascript 같은 폴더 선택 창이 없어서, 화면 안에서 폴더를 둘러봐요)

import (
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

type fsEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Icon string `json:"icon,omitempty"`
}

func quickPlaces() []fsEntry {
	home, _ := os.UserHomeDir()
	out := []fsEntry{}
	for _, p := range []struct{ name, dir, icon string }{
		{"바탕 화면", "Desktop", "🖥️"}, {"문서", "Documents", "📄"}, {"다운로드", "Downloads", "⬇️"},
		{"사진", "Pictures", "🖼️"}, {"음악", "Music", "🎵"},
	} {
		d := filepath.Join(home, p.dir)
		if dirExists(d) {
			out = append(out, fsEntry{p.name, d, p.icon})
		}
	}
	// OneDrive 로 옮겨진 바탕 화면 · 문서도 찾아요
	if od := os.Getenv("OneDrive"); od != "" && dirExists(od) {
		out = append(out, fsEntry{"OneDrive", od, "☁️"})
	}
	return out
}

func drives() []fsEntry {
	out := []fsEntry{}
	if runtime.GOOS != "windows" {
		return append(out, fsEntry{"내 컴퓨터", "/", "💽"})
	}
	for c := 'C'; c <= 'Z'; c++ {
		root := string(c) + ":\\"
		if _, err := os.Stat(root); err == nil {
			out = append(out, fsEntry{string(c) + ": 드라이브", root, "💽"})
		}
	}
	return out
}

func (a *App) handleFsList(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Path string `json:"path"`
	}
	readJSON(r, &in)
	p := in.Path
	if p == "" || !dirExists(p) {
		home, _ := os.UserHomeDir()
		p = home
	}
	p = filepath.Clean(p)
	ents, err := os.ReadDir(p)
	dirs := []fsEntry{}
	if err == nil {
		for _, e := range ents {
			n := e.Name()
			if strings.HasPrefix(n, ".") || strings.HasPrefix(n, "$") || n == "System Volume Information" || strings.EqualFold(n, "desktop.ini") {
				continue
			}
			full := filepath.Join(p, n)
			isDir := e.IsDir()
			if !isDir && e.Type()&os.ModeSymlink != 0 {
				isDir = dirExists(full)
			}
			if isDir {
				dirs = append(dirs, fsEntry{Name: composeHangul(n), Path: full})
			}
		}
	}
	sort.Slice(dirs, func(i, j int) bool { return strings.ToLower(dirs[i].Name) < strings.ToLower(dirs[j].Name) })
	parent := filepath.Dir(p)
	if parent == p {
		parent = ""
	}
	writeJSON(w, map[string]any{
		"path": p, "name": composeHangul(filepath.Base(p)), "parent": parent, "dirs": dirs,
		"places": quickPlaces(), "drives": drives(), "readable": err == nil,
	})
}

func (a *App) handleFsMkdir(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Path string `json:"path"`
		Name string `json:"name"`
	}
	readJSON(r, &in)
	name := strings.TrimSpace(in.Name)
	if name == "" || strings.ContainsAny(name, `\/:*?"<>|`) || name == "." || name == ".." {
		jsonError(w, 400, "폴더 이름에 쓸 수 없는 글자가 있어요")
		return
	}
	dir := filepath.Join(in.Path, name)
	if err := os.Mkdir(dir, 0o755); err != nil {
		if os.IsExist(err) {
			jsonError(w, 400, "같은 이름의 폴더가 이미 있어요")
			return
		}
		jsonError(w, 500, "이 위치에는 폴더를 만들 수 없어요")
		return
	}
	writeJSON(w, map[string]any{"ok": true, "path": dir})
}
