package main

// 맥 · Windows 차이
//   isWindows : 실제로 Windows 에서 도는지 (실행기 · 업데이트 · 탐색기)
//   uiOS      : 화면 문구를 어느 OS 에 맞출지 (시험용 MSROAD_FAKE_OS=windows)
//   noHEIC    : Windows 버전은 HEIC 를 읽지 않아요 (Windows 는 기본으로 HEIC 를 못 열어요)

import "runtime"

var isWindows = runtime.GOOS == "windows"

func uiOS() string {
	if f := env("FAKE_OS"); f != "" {
		return f
	}
	return runtime.GOOS
}

func noHEIC() bool { return uiOS() == "windows" }
