package main

// 엔진 지킴이 (supervisor)
//
// 실행기는 엔진을 MSROAD_SUPERVISOR=1 로 켜요. 그러면 이 프로그램은 먼저 '지킴이'가 되어
//   1) 실행기와 완전히 떨어진 새 세션으로 옮겨 가고 (실행기가 끝나도 함께 꺼지지 않게)
//   2) 진짜 엔진을 자식으로 켠 뒤
//   3) 엔진이 비정상으로 꺼지면 기록을 남기고 같은 주소(포트·토큰)로 곧바로 다시 켜요.
// 엔진이 스스로 정상 종료(종료 버튼 · 오래 쉼 · 업데이트 후 다시 시작)하면 지킴이도 함께 끝나요.

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

const (
	maxRestarts   = 5
	restartWindow = 5 * time.Minute
)

func supLog(support, format string, a ...any) {
	p := filepath.Join(support, "launcher.log")
	if st, err := os.Stat(p); err == nil && st.Size() > 256<<10 {
		os.Rename(p, filepath.Join(support, "launcher.prev.log"))
	}
	f, err := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "%s [지킴이 %d] %s\n", time.Now().Format("01-02 15:04:05"), os.Getpid(), fmt.Sprintf(format, a...))
}

func tailFile(p string, n int) string {
	b, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	lines := strings.Split(strings.TrimRight(string(b), "\n"), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return strings.Join(lines, "\n")
}

func runSupervisor(support string) {
	detachSelf()
	self, err := os.Executable()
	if err != nil {
		supLog(support, "엔진 위치를 찾지 못했어요: %v", err)
		os.Exit(1)
	}
	supLog(support, "시작 · 엔진 %s · %s/%s", build, runtime.GOOS, runtime.GOARCH)

	// 지킴이가 신호를 받으면 엔진에게도 전해요
	var child *os.Process
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		s := <-sig
		supLog(support, "신호 %v 를 받아 엔진을 끕니다", s)
		if child != nil {
			child.Signal(s)
		}
	}()

	baseEnv := []string{}
	for _, kv := range os.Environ() {
		if strings.HasPrefix(kv, "MSROAD_SUPERVISOR=") || strings.HasPrefix(kv, "MSROAD_PORT=") || strings.HasPrefix(kv, "MSROAD_PORT_WAIT=") {
			continue
		}
		baseEnv = append(baseEnv, kv)
	}
	port := env("PORT")
	wait := env("PORT_WAIT")
	var crashes []time.Time

	for {
		out := filepath.Join(support, "engine.out")
		if _, err := os.Stat(out); err == nil {
			os.Rename(out, filepath.Join(support, "engine.prev.out"))
		}
		f, _ := os.OpenFile(out, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
		cmd := exec.Command(self)
		cmd.Env = append(append([]string{}, baseEnv...), "MSROAD_PORT="+port, "MSROAD_PORT_WAIT="+wait, "MSROAD_CHILD=1")
		cmd.Stdout, cmd.Stderr = f, f
		started := time.Now()
		if err := cmd.Start(); err != nil {
			supLog(support, "엔진을 켜지 못했어요: %v", err)
			if f != nil {
				f.Close()
			}
			os.Exit(1)
		}
		child = cmd.Process
		supLog(support, "엔진 켬 (pid %d, 포트 %s)", cmd.Process.Pid, orDash(port))
		err := cmd.Wait()
		if f != nil {
			f.Close()
		}
		code := cmd.ProcessState.ExitCode()
		how := fmt.Sprintf("종료 코드 %d", code)
		if ws, ok := cmd.ProcessState.Sys().(syscall.WaitStatus); ok && ws.Signaled() {
			how = fmt.Sprintf("신호 %v 로 꺼짐", ws.Signal())
		}
		ran := time.Since(started).Round(time.Second)
		if err == nil && code == 0 {
			supLog(support, "엔진이 정상적으로 끝났어요 (%s 동안 실행)", ran)
			return
		}
		supLog(support, "⚠️ 엔진이 갑자기 꺼졌어요: %s, %s 동안 실행\n----- 엔진 마지막 출력 -----\n%s\n----------------------------", how, ran, headTail(out, 30, 8))

		now := time.Now()
		kept := crashes[:0]
		for _, t := range crashes {
			if now.Sub(t) < restartWindow {
				kept = append(kept, t)
			}
		}
		crashes = append(kept, now)
		if len(crashes) > maxRestarts {
			supLog(support, "5분 안에 %d번 꺼져서 더 이상 다시 켜지 않아요", len(crashes))
			os.Exit(1)
		}
		// 같은 포트·토큰으로 다시 켜서 열려 있던 창이 그대로 이어지게 해요
		if b, err := os.ReadFile(filepath.Join(support, "lastport")); err == nil && strings.TrimSpace(string(b)) != "" {
			port = strings.TrimSpace(string(b))
		}
		wait = "1"
		time.Sleep(700 * time.Millisecond)
	}
}

func orDash(s string) string {
	if s == "" {
		return "자동"
	}
	return s
}

// headTail keeps the first lines (where Go prints "panic:" / "fatal error:") and the last few.
func headTail(p string, head, tail int) string {
	b, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	lines := strings.Split(strings.TrimRight(string(b), "\n"), "\n")
	if len(lines) <= head+tail+1 {
		return strings.Join(lines, "\n")
	}
	return strings.Join(lines[:head], "\n") + fmt.Sprintf("\n… (%d줄 생략) …\n", len(lines)-head-tail) + strings.Join(lines[len(lines)-tail:], "\n")
}
