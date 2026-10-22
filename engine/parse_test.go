package main

import "testing"

func TestParse(t *testing.T) {
	cases := []struct{ in, prefix, chord string; page int }{
		{"구주의십자가보혈로Ab", "구주의십자가보혈로", "Ab", 0},
		{"광야를지나며F#m", "광야를지나며", "F#m", 0},
		{"Amazing Grace_G", "Amazing Grace", "G", 0},
		{"Amazing Grace", "Amazing Grace", "", 0},
		{"Holy Holy HolyD", "Holy Holy HolyD", "", 0},
		{"주의은혜라A_1", "주의은혜라", "A", 1},
		{"주의은혜라A_2", "주의은혜라", "A", 2},
		{"Way Maker_Bb_2", "Way Maker", "Bb", 2},
		{"주님 다시 오실 때까지 Ebm", "주님 다시 오실 때까지", "Ebm", 0},
		{"내 영혼이 은총 입어E♭", "내 영혼이 은총 입어", "Eb", 0},
		{"Psalm", "Psalm", "", 0},
		{"B", "B", "", 0},
		{"찬양_3", "찬양", "", 3},
		{"시편 23편C", "시편 23편", "C", 0},
		{"Psalm 23_C#m", "Psalm 23", "C#m", 0},
		{"2024 성탄G_12", "2024 성탄", "G", 12},
	}
	for _, c := range cases {
		p := parseStem(c.in)
		if p.prefix != c.prefix || p.chord != c.chord || p.page != c.page {
			t.Errorf("%q → prefix %q chord %q page %d", c.in, p.prefix, p.chord, p.page)
		}
	}
	// NFD 한글
	if got := composeHangul("각"); got != "각" {
		t.Errorf("compose %q", got)
	}
	for _, c := range []string{"A", "Ab", "F#m", "Bbm", "C#"} {
		if !validChord(c) {
			t.Errorf("valid %s", c)
		}
	}
	for _, c := range []string{"H", "a", "Abb", "Amaj7", ""} {
		if validChord(c) {
			t.Errorf("invalid %s", c)
		}
	}
	// 새 이름
	s := Sheet{prefix: "Amazing Grace"}
	if got := newStemFor(s, "G", &Page{}); got != "Amazing Grace_G" {
		t.Error(got)
	}
	s = Sheet{prefix: "주의은혜라"}
	if got := newStemFor(s, "A", &Page{suffix: "_1"}); got != "주의은혜라A_1" {
		t.Error(got)
	}
	s = Sheet{prefix: "주의 사랑", Sep: " ", Chord: "C"}
	if got := newStemFor(s, "D", &Page{}); got != "주의 사랑 D" {
		t.Error(got)
	}
}
