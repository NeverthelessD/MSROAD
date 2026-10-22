package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNewSheets(t *testing.T) {
	sup, root := t.TempDir(), t.TempDir()
	w := func(name string) {
		p := filepath.Join(root, name)
		os.WriteFile(p, []byte(name), 0o644)
		mt := time.Now().Add(-time.Hour)
		os.Chtimes(p, mt, mt)
	}
	w("주의은혜라A_1.jpg")
	w("주의은혜라A_2.jpg")
	w("Amazing Grace_G.jpg")

	l := NewLibrary(sup)
	l.Scan(root, true)
	if a, _ := l.LastChange(); a != 0 || l.NewCount() != 0 {
		t.Fatalf("first read should mark nothing new, got added=%d new=%d", a, l.NewCount())
	}

	// 앱을 끈 사이 새 악보 2곡(3장)이 들어옴 → 다시 켬
	w("광야를지나며F#m.png")
	w("새노래C_1.jpg")
	time.Sleep(10 * time.Millisecond)
	w("새노래C_2.jpg")
	l2 := NewLibrary(sup)
	l2.Scan(root, true)
	if a, _ := l2.LastChange(); a != 2 {
		t.Fatalf("expected 2 new sheets, got %d", a)
	}
	if l2.NewCount() != 2 {
		t.Fatalf("expected 2 sheets marked new, got %d", l2.NewCount())
	}

	// 앱에서 코드를 붙여 이름만 바꾼 경우 → 새 악보 아님
	os.Rename(filepath.Join(root, "Amazing Grace_G.jpg"), filepath.Join(root, "Amazing Grace_A.jpg"))
	l2.Scan(root, true)
	if a, _ := l2.LastChange(); a != 0 {
		t.Fatalf("rename should not count as new, got %d", a)
	}
	// 앞에서 새로 들어온 표시는 이번 실행 동안 유지
	if l2.NewCount() != 2 {
		t.Fatalf("new marks should stay during the session, got %d", l2.NewCount())
	}
	// 다시 켜면 더 이상 새 악보가 아님
	l3 := NewLibrary(sup)
	l3.Scan(root, true)
	if l3.NewCount() != 0 {
		t.Fatalf("after restart nothing should be new, got %d", l3.NewCount())
	}
}
