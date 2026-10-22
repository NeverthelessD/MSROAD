package main

// 코드 붙이기 · 바꾸기 — 파일 이름의 확장자 바로 앞에 코드를 넣어요.
//   구주의십자가보혈로.jpg   + Ab → 구주의십자가보혈로Ab.jpg
//   Amazing Grace.jpg       + G  → Amazing Grace_G.jpg   (영어 제목은 "_")
//   주의은혜라_1.jpg, _2.jpg + A  → 주의은혜라A_1.jpg, 주의은혜라A_2.jpg (모든 장을 함께)
// 바로 전 이름 바꾸기는 '되돌리기'로 원래대로 돌릴 수 있어요.

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unicode/utf8"
)

type renameOp struct{ From, To string }

type Renamer struct {
	mu   sync.Mutex
	last []renameOp // 되돌리기용 (가장 최근 한 번)
	desc string
}

// newStemFor builds the new file name stem for a sheet page with the given chord ("" removes the chord).
func newStemFor(s Sheet, chord string, p *Page) string {
	prefix := s.Prefix
	sep := s.Sep
	if chord == "" {
		sep = ""
	} else if s.Chord == "" || sep == "" {
		sep = ""
		if r, _ := utf8.DecodeLastRuneInString(prefix); isASCIILetter(r) {
			sep = "_"
		}
	}
	return prefix + sep + chord + p.Suffix
}

func (rn *Renamer) Assign(lib *Library, id, chord string) (string, error) {
	chord = strings.NewReplacer("♭", "b", "♯", "#").Replace(strings.TrimSpace(chord))
	if chord != "" && !validChord(chord) {
		return "", errors.New("코드는 A~G 로 시작하고 b(플랫) · #(샵) · m(마이너)만 붙일 수 있어요")
	}
	s, ok := lib.sheet(id)
	if !ok {
		return "", errors.New("악보를 찾을 수 없어요. 목록을 새로 고쳐 주세요")
	}
	if s.Chord == chord {
		return id, nil
	}
	var ops []renameOp
	for _, p := range s.Pages {
		stem := newStemFor(s, chord, p)
		// 새 이름을 다시 읽었을 때 같은 코드가 나오는지 확인
		if got := parseStem(stem); got.chord != chord {
			return "", fmt.Errorf("‘%s’ 이름에는 코드를 붙일 수 없어요. 파일 이름을 직접 바꿔 주세요", p.Name)
		}
		to := filepath.Join(filepath.Dir(p.path), stem+filepath.Ext(p.path))
		if to == p.path {
			continue
		}
		if _, err := os.Lstat(to); err == nil && !strings.EqualFold(to, p.path) {
			return "", fmt.Errorf("같은 이름의 파일(%s)이 이미 있어요", composeHangul(filepath.Base(to)))
		}
		ops = append(ops, renameOp{From: p.path, To: to})
	}
	if err := applyOps(ops); err != nil {
		return "", err
	}
	rn.mu.Lock()
	rn.last = ops
	if chord == "" {
		rn.desc = fmt.Sprintf("%s 코드를 지웠어요", s.Title)
	} else {
		rn.desc = fmt.Sprintf("%s → %s", s.Title, chord)
	}
	rn.mu.Unlock()
	return id, nil
}

// applyOps renames all files, or none (rolls back on failure).
func applyOps(ops []renameOp) error {
	for i, op := range ops {
		if err := os.Rename(op.From, op.To); err != nil {
			for j := i - 1; j >= 0; j-- {
				os.Rename(ops[j].To, ops[j].From)
			}
			if os.IsPermission(err) {
				return errors.New("이 폴더의 파일 이름을 바꿀 권한이 없어요")
			}
			return fmt.Errorf("파일 이름을 바꾸지 못했어요: %s", composeHangul(filepath.Base(op.From)))
		}
	}
	return nil
}

func (rn *Renamer) Undo() error {
	rn.mu.Lock()
	ops := rn.last
	rn.last = nil
	rn.mu.Unlock()
	if len(ops) == 0 {
		return errors.New("되돌릴 작업이 없어요")
	}
	rev := make([]renameOp, len(ops))
	for i, op := range ops {
		if _, err := os.Lstat(op.From); err == nil {
			return fmt.Errorf("원래 이름(%s)의 파일이 이미 있어서 되돌릴 수 없어요", composeHangul(filepath.Base(op.From)))
		}
		rev[i] = renameOp{From: op.To, To: op.From}
	}
	return applyOps(rev)
}

func (rn *Renamer) CanUndo() (bool, string) {
	rn.mu.Lock()
	defer rn.mu.Unlock()
	return len(rn.last) > 0, rn.desc
}
