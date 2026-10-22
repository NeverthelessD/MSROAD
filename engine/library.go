package main

// 악보 폴더 읽기 · 파일 이름 해석 · 곡/악보/쪽 묶기
//
// 파일 이름 규칙
//   구주의십자가보혈로Ab.jpg   → 제목 "구주의십자가보혈로", 코드 Ab
//   광야를지나며F#m.png         → 코드 F#m
//   Amazing Grace_G.jpg         → 영어 제목은 코드 앞에 "_" (바로 앞이 영어 알파벳이면 코드로 보지 않음)
//   주의은혜라A_1.jpg, _2.jpg   → 여러 장짜리 악보의 1쪽, 2쪽

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
)

var sheetExts = map[string]string{
	".jpg": "image", ".jpeg": "image", ".png": "image", ".gif": "image", ".webp": "image",
	".heic": "heic", ".heif": "heic", ".pdf": "pdf",
}

const maxFiles = 30000

type Page struct {
	N      int    `json:"n"`    // 쪽 번호 (_1 → 1). 번호 없으면 0
	Name   string `json:"name"` // 파일 이름
	Ext    string `json:"ext"`  // .jpg …
	Kind   string `json:"kind"` // image | heic | pdf
	Size   int64  `json:"size"`
	Mod    int64  `json:"mod"`    // ms
	Suffix string `json:"suffix"` // 원래 쪽 표시 (_1, _01 …)
	rel    string
	path   string
}

type Sheet struct {
	ID     string  `json:"id"`
	Title  string  `json:"title"`
	Song   string  `json:"song"`  // 같은 곡 찾기용 키 (공백·기호 빼고 소문자)
	Chord  string  `json:"chord"` // "" = 코드 없음
	Root   string  `json:"root"`  // A~G
	Dir    string  `json:"dir"`   // 고른 폴더 기준 하위 폴더 ("" = 바로 안)
	Sep    string  `json:"sep"`
	Pages  []*Page `json:"pages"`
	Mod    int64   `json:"mod"`
	Prefix string  `json:"prefix"` // 코드 앞 원래 글자 (구분자 제외)
	New    bool    `json:"new"`    // 이번에 앱을 켠 뒤(또는 지난번 실행 이후) 새로 들어온 악보
}

type Library struct {
	mu        sync.Mutex
	root      string
	sheets    []*Sheet
	byID      map[string]*Sheet
	rev       int64
	sig       string
	scannedAt int64
	scanErr   string
	truncated bool

	seenDir string          // 폴더마다 이미 본 파일 목록을 저장하는 곳
	fresh   map[string]bool // 이번 실행에서 새로 들어온 파일 (상대 경로)
	added   int             // 마지막으로 다시 읽었을 때 새로 들어온 악보 수
	removed int             // 마지막으로 다시 읽었을 때 사라진 파일 수
}

func NewLibrary(support string) *Library {
	return &Library{byID: map[string]*Sheet{}, seenDir: filepath.Join(support, "seen"), fresh: map[string]bool{}}
}

// ---------------------------------------------------------------- 새 악보 알아보기
// 폴더마다 '이미 본 파일' 목록(경로 + 크기·수정 시각)을 저장해 두고, 다음에 읽을 때 없던 파일을 '새 악보'로 표시해요.
// 앱에서 코드를 붙여 이름만 바뀐 파일은 크기·수정 시각이 같아서 새 악보로 치지 않아요.

type seenSet struct {
	Paths []string `json:"paths"`
	Sigs  []string `json:"sigs"`
}

func (l *Library) seenPath(root string) string {
	return filepath.Join(l.seenDir, shortHash(root)+".json")
}

func fileSig(f fileInfo) string {
	return strconv.FormatInt(f.size, 10) + "|" + strconv.FormatInt(f.mod, 10)
}

// updateSeen returns the relative paths that are new since last time (nil the first time a folder is read).
func (l *Library) updateSeen(root string, files []fileInfo) (newRel []string, removed int, first bool) {
	var old seenSet
	b, err := os.ReadFile(l.seenPath(root))
	first = err != nil || json.Unmarshal(b, &old) != nil
	paths := make(map[string]bool, len(old.Paths))
	for _, p := range old.Paths {
		paths[p] = true
	}
	sigs := make(map[string]bool, len(old.Sigs))
	for _, x := range old.Sigs {
		sigs[x] = true
	}
	cur := seenSet{Paths: make([]string, 0, len(files)), Sigs: make([]string, 0, len(files))}
	now := make(map[string]bool, len(files))
	for _, f := range files {
		cur.Paths = append(cur.Paths, f.rel)
		cur.Sigs = append(cur.Sigs, fileSig(f))
		now[f.rel] = true
		if !first && !paths[f.rel] && !sigs[fileSig(f)] {
			newRel = append(newRel, f.rel)
		}
	}
	for p := range paths {
		if !now[p] {
			removed++
		}
	}
	if first || len(newRel) > 0 || removed > 0 || len(old.Paths) != len(cur.Paths) {
		os.MkdirAll(l.seenDir, 0o755)
		if b, err := json.Marshal(cur); err == nil {
			writeFileAtomic(l.seenPath(root), b, 0o644)
		}
	}
	return newRel, removed, first
}

// ---------------------------------------------------------------- parsing

type parsed struct {
	prefix string // 코드 앞 (구분자 빼고, 원래 글자 그대로)
	sep    string // "_", " ", "-" 또는 ""
	chord  string
	page   int
	suffix string // "_1"
}

func isASCIILetter(r rune) bool { return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') }

// parseStem reads the chord and page number at the end of a file name (without extension).
func parseStem(stem string) parsed {
	stem = strings.NewReplacer("♭", "b", "♯", "#").Replace(stem)
	var p parsed
	// 1) 쪽 번호: 끝의 _숫자 (1~99)
	if i := strings.LastIndex(stem, "_"); i > 0 && i < len(stem)-1 {
		num := stem[i+1:]
		if len(num) <= 2 && allDigits(num) {
			if n, _ := strconv.Atoi(num); n >= 1 && n <= 99 {
				p.page, p.suffix = n, stem[i:]
				stem = stem[:i]
			}
		}
	}
	// 2) 코드: 끝의 [A-G][b#]?m?
	rs := []rune(stem)
	n := len(rs)
	end := n
	minor := false
	if end > 0 && rs[end-1] == 'm' {
		minor = true
		end--
	}
	acc := ""
	if end > 0 && (rs[end-1] == 'b' || rs[end-1] == '#') {
		acc = string(rs[end-1])
		end--
	}
	if end > 0 && rs[end-1] >= 'A' && rs[end-1] <= 'G' {
		start := end - 1
		// 바로 앞 글자가 영어 알파벳이면 코드가 아니에요 (영어 제목은 "_" 를 붙여요)
		if start > 0 && !isASCIILetter(rs[start-1]) {
			chord := string(rs[start]) + acc
			if minor {
				chord += "m"
			}
			before := string(rs[:start])
			sep := ""
			for _, s := range []string{"_", " ", "-"} {
				if strings.HasSuffix(before, s) {
					sep = s
					before = strings.TrimSuffix(before, s)
					break
				}
			}
			if strings.TrimSpace(before) != "" {
				p.prefix, p.sep, p.chord = before, sep, chord
				return p
			}
		}
	}
	// 코드 없음 — "Bb" 처럼 m 이나 b 가 제목의 일부일 수도 있으니 다시 원래대로
	p.prefix = stem
	return p
}

func allDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return s != ""
}

func validChord(c string) bool {
	p := parseStem("가" + c)
	return c != "" && p.chord == c
}

// displayTitle trims separators left over at the end of a prefix.
func displayTitle(prefix string) string {
	t := composeHangul(prefix)
	t = strings.TrimRight(t, " _-")
	t = strings.TrimSpace(t)
	if t == "" {
		t = composeHangul(prefix)
	}
	return t
}

// songKey groups different keys (versions) of the same song.
func songKey(title string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(composeHangul(title)) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// composeHangul turns decomposed Hangul (NFD, as macOS sometimes stores names) into syllables (NFC).
func composeHangul(s string) string {
	rs := []rune(s)
	out := make([]rune, 0, len(rs))
	for i := 0; i < len(rs); i++ {
		r := rs[i]
		if r >= 0x1100 && r <= 0x1112 && i+1 < len(rs) && rs[i+1] >= 0x1161 && rs[i+1] <= 0x1175 {
			l, v := r-0x1100, rs[i+1]-0x1161
			t := rune(0)
			i++
			if i+1 < len(rs) && rs[i+1] >= 0x11A8 && rs[i+1] <= 0x11C2 {
				t = rs[i+1] - 0x11A7
				i++
			}
			out = append(out, 0xAC00+(l*21+v)*28+t)
			continue
		}
		// 이미 합쳐진 글자 + 받침 조각
		if r >= 0xAC00 && r <= 0xD7A3 && (r-0xAC00)%28 == 0 && i+1 < len(rs) && rs[i+1] >= 0x11A8 && rs[i+1] <= 0x11C2 {
			out = append(out, r+rs[i+1]-0x11A7)
			i++
			continue
		}
		out = append(out, r)
	}
	return string(out)
}

func shortHash(parts ...string) string {
	h := sha1.New()
	for _, p := range parts {
		h.Write([]byte(p))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))[:12]
}

// ---------------------------------------------------------------- scanning

type fileInfo struct {
	path, rel string
	size, mod int64
}

func listFiles(root string, sub bool) ([]fileInfo, bool, error) {
	var files []fileInfo
	truncated := false
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			if p == root {
				return err
			}
			if d != nil && d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		name := d.Name()
		if d.IsDir() {
			if p == root {
				return nil
			}
			if !sub || strings.HasPrefix(name, ".") || strings.HasSuffix(name, ".app") || name == "node_modules" {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "~$") {
			return nil
		}
		if _, ok := sheetExts[strings.ToLower(filepath.Ext(name))]; !ok {
			return nil
		}
		info, err := d.Info()
		if err != nil || !info.Mode().IsRegular() {
			return nil
		}
		if len(files) >= maxFiles {
			truncated = true
			return filepath.SkipAll
		}
		rel, _ := filepath.Rel(root, p)
		files = append(files, fileInfo{path: p, rel: rel, size: info.Size(), mod: info.ModTime().UnixMilli()})
		return nil
	})
	return files, truncated, err
}

// Scan reads the folder again. Returns true when something changed.
func (l *Library) Scan(root string, sub bool) bool {
	if root == "" {
		l.mu.Lock()
		changed := l.root != "" || len(l.sheets) > 0
		l.root, l.sheets, l.byID, l.sig, l.scanErr = "", nil, map[string]*Sheet{}, "", ""
		if changed {
			l.rev++
		}
		l.mu.Unlock()
		return changed
	}
	files, truncated, err := listFiles(root, sub)
	sigH := sha1.New()
	for _, f := range files {
		sigH.Write([]byte(f.rel + "|" + strconv.FormatInt(f.size, 10) + "|" + strconv.FormatInt(f.mod, 10) + "\n"))
	}
	sig := root + ":" + hex.EncodeToString(sigH.Sum(nil))
	scanErr := ""
	if err != nil {
		scanErr = "폴더를 읽지 못했어요. 폴더가 있는지, 외장 디스크라면 연결돼 있는지 확인해 주세요"
		if os.IsPermission(err) {
			scanErr = "이 폴더를 읽을 권한이 없어요. 다른 폴더를 골라 주세요"
		}
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	l.scannedAt = time.Now().UnixMilli()
	if sig == l.sig && scanErr == l.scanErr && root == l.root {
		l.added, l.removed = 0, 0
		return false
	}
	if root != l.root {
		l.fresh = map[string]bool{}
	}
	l.added, l.removed = 0, 0
	if err == nil {
		newRel, removed, _ := l.updateSeen(root, files)
		for _, r := range newRel {
			l.fresh[r] = true
		}
		l.removed = removed
		l.added = countSheetsOf(newRel)
	}
	l.root, l.sig, l.scanErr, l.truncated = root, sig, scanErr, truncated
	l.sheets, l.byID = buildSheets(files)
	for _, sh := range l.sheets {
		for _, pg := range sh.Pages {
			if l.fresh[pg.rel] {
				sh.New = true
				break
			}
		}
	}
	l.rev++
	return true
}

// countSheetsOf counts distinct sheets among new files (pages _1, _2 of the same sheet count once).
func countSheetsOf(rels []string) int {
	seen := map[string]bool{}
	for _, r := range rels {
		stem := strings.TrimSuffix(filepath.Base(r), filepath.Ext(r))
		p := parseStem(stem)
		seen[filepath.Dir(r)+"\x00"+composeHangul(p.prefix)+"\x00"+p.sep+"\x00"+p.chord] = true
	}
	return len(seen)
}

// LastChange: 마지막으로 다시 읽었을 때 새로 들어온 악보 수와 사라진 파일 수
func (l *Library) LastChange() (int, int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.added, l.removed
}

// NewCount: 이번 실행에서 새로 들어온 악보 수 (지금 목록 기준)
func (l *Library) NewCount() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	n := 0
	for _, sh := range l.sheets {
		if sh.New {
			n++
		}
	}
	return n
}

func buildSheets(files []fileInfo) ([]*Sheet, map[string]*Sheet) {
	byKey := map[string]*Sheet{}
	var order []*Sheet
	for _, f := range files {
		base := filepath.Base(f.rel)
		ext := filepath.Ext(base)
		stem := strings.TrimSuffix(base, ext)
		p := parseStem(stem)
		dir := filepath.Dir(f.rel)
		if dir == "." {
			dir = ""
		}
		title := displayTitle(p.prefix)
		key := dir + "\x00" + composeHangul(p.prefix) + "\x00" + p.sep + "\x00" + p.chord
		s := byKey[key]
		if s == nil {
			s = &Sheet{
				ID:     shortHash(key),
				Title:  title,
				Song:   songKey(title),
				Chord:  p.chord,
				Dir:    composeHangul(filepath.ToSlash(dir)),
				Sep:    p.sep,
				Prefix: p.prefix,
			}
			if p.chord != "" {
				s.Root = p.chord[:1]
			}
			byKey[key] = s
			order = append(order, s)
		}
		pg := &Page{N: p.page, Name: composeHangul(base), Ext: strings.ToLower(ext), Size: f.size, Mod: f.mod, Suffix: p.suffix, path: f.path, rel: f.rel}
		pg.Kind = sheetExts[pg.Ext]
		s.Pages = append(s.Pages, pg)
		if f.mod > s.Mod {
			s.Mod = f.mod
		}
	}
	byID := map[string]*Sheet{}
	for _, s := range order {
		sort.SliceStable(s.Pages, func(i, j int) bool {
			if s.Pages[i].N != s.Pages[j].N {
				return s.Pages[i].N < s.Pages[j].N
			}
			return s.Pages[i].Name < s.Pages[j].Name
		})
		byID[s.ID] = s
	}
	return order, byID
}

func (l *Library) Snapshot() map[string]any {
	l.mu.Lock()
	defer l.mu.Unlock()
	return map[string]any{
		"rev":       l.rev,
		"root":      l.root,
		"rootName":  composeHangul(filepath.Base(l.root)),
		"sheets":    l.sheets,
		"error":     l.scanErr,
		"truncated": l.truncated,
		"scannedAt": l.scannedAt,
	}
}

func (l *Library) Rev() int64 {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.rev
}

func (l *Library) Root() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.root
}

// page finds the file for a sheet id and page index (0-based position in Pages).
func (l *Library) page(id string, idx int) (*Page, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	s := l.byID[id]
	if s == nil || idx < 0 || idx >= len(s.Pages) {
		return nil, false
	}
	return s.Pages[idx], true
}

func (l *Library) sheet(id string) (Sheet, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	s := l.byID[id]
	if s == nil {
		return Sheet{}, false
	}
	c := *s
	c.Pages = append([]*Page(nil), s.Pages...)
	return c, true
}
