//go:build !windows

package main

import (
	"os/exec"
	"syscall"
)

func detach(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
}

// detachSelf moves this process into its own session, so it keeps running when the launcher ends.
func detachSelf() { syscall.Setsid() }
