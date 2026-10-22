# MSROAD — notes for Claude

**Read `PROJECT_NOTES.md` first** (structure, decisions, progress checklist) and update it at the end of every task.
MSROAD is a personal macOS (Apple Silicon) sheet-music sorter/viewer for **Nevertheless_D**, who is not a programmer.
Talk to them in Korean, in plain words. Never ask them to use Terminal. It follows the same "script-type app" pattern
as their YTROAD and SROAD apps (bash launcher + Go engine + web UI in a Chrome `--app` window, self-update from `releases/latest.json`).
Never mention GitHub (or the repo name) in anything the user sees.

**Since 1.1.0 MSROAD.app is a real, visible Dock app** (Swift shell `app/shell/main.swift`, WKWebView window); the Go engine runs
as its child only while the app is open. This follows macOS 27's "Background App Activity" rule (helpers are exempt while the app
that launched them is in the Dock) instead of working around it — never reintroduce hidden helpers or SIGTERM-ignoring.
The app can only be built on a Mac: pushing changes under app/, engine/ or VERSION triggers `.github/workflows/build-mac.yml`, which builds,
ad-hoc signs, runs real-Mac smoke tests and force-pushes results to the `ci-results` branch (this session's proxy blocks the Actions API,
so read results via git). Release with `scripts/release.sh`. Full history and the test recipe are in PROJECT_NOTES.md.
`signal.Ignore` can't be undone with `signal.Reset`. In tests use `pkill -x`, never `pkill -f msroad-engine`.
