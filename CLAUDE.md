# MSROAD — notes for Claude

**Read `PROJECT_NOTES.md` first** (structure, decisions, progress checklist) and update it at the end of every task.
MSROAD is a personal macOS (Apple Silicon) sheet-music sorter/viewer for **Nevertheless_D**, who is not a programmer.
Talk to them in Korean, in plain words. Never ask them to use Terminal. It follows the same "script-type app" pattern
as their YTROAD and SROAD apps (bash launcher + Go engine + web UI in a Chrome `--app` window, self-update from `releases/latest.json`).
Never mention GitHub (or the repo name) in anything the user sees.

**macOS 27 (important for every script-type app):** when the app's main executable (the bash launcher) exits, macOS sends SIGTERM to
everything that app started — `nohup`/`disown`/`setsid` don't help. So the engine is started as a separate background helper app
(`Support/bin/MSROAD Engine.app`, launched with `open -g -j -n -a … --args --env MSROAD_X=…`) under a supervisor (`engine/supervise.go`)
that ignores SIGTERM for the first 20 s and restarts the engine on crashes. Details and the test recipe are in PROJECT_NOTES.md (v1.0.4).
`signal.Ignore` can't be undone with `signal.Reset` — use Notify + drain. In tests use `pkill -x`, never `pkill -f msroad-engine`.
