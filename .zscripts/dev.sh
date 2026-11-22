#!/bin/bash
# TeraStream dev/start script (platform convention).
# Serves the built app + TeraBox API on port 3000 via server/index.mjs.
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

LOG_FILE="$PROJECT_DIR/dev.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >>"$LOG_FILE"; }

# Build if the bundle is missing
if [ ! -f dist/index.html ]; then
  log "dist/ missing - building..."
  npm run build >>"$LOG_FILE" 2>&1 || { log "BUILD FAILED"; exit 1; }
fi

# Stop any previous instance
if [ -f .zscripts/dev.pid ]; then
  OLD_PID="$(cat .zscripts/dev.pid 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    log "Stopping previous server (PID $OLD_PID)"
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
fi
pkill -f "node server/index.mjs" 2>/dev/null || true
sleep 1

log "Starting TeraStream server on port 3000"

# Double-fork daemon so the process survives shell/tool-session cleanup.
python3 - <<'PYEOF'
import os, sys, time
pid = os.fork()
if pid > 0:
    time.sleep(0.2)
    sys.exit(0)
os.setsid()
pid = os.fork()
if pid > 0:
    os._exit(0)
log = open('/home/z/my-project/dev.log', 'a', buffering=1)
devnull = os.open(os.devnull, os.O_RDONLY)
os.dup2(devnull, 0)
os.dup2(log.fileno(), 1)
os.dup2(log.fileno(), 2)
os.chdir('/home/z/my-project')
os.environ['PORT'] = '3000'
os.execvp('node', ['node', 'server/index.mjs'])
PYEOF

# Find and record the daemon PID
sleep 1
NEW_PID="$(pgrep -f "node server/index.mjs" | head -1 || true)"
if [ -n "$NEW_PID" ]; then
  echo "$NEW_PID" > .zscripts/dev.pid
  log "Server started (PID $NEW_PID)"
else
  log "ERROR: server did not start"
  exit 1
fi

# Health check
for i in $(seq 1 20); do
  if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
    log "Health check passed"
    echo "TeraStream running on http://localhost:3000"
    exit 0
  fi
  sleep 1
done
log "ERROR: health check failed"
exit 1
