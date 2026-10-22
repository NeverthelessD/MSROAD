//go:build windows

package main

import "os/exec"

// Windows 버전은 나중에 만들어요. 지금은 빌드만 되도록 자리만 잡아 둡니다.
func detach(cmd *exec.Cmd) {}

func detachSelf() {}
