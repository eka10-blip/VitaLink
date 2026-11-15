#!/bin/zsh
# Manage the background Presage worker (survives Cursor/terminal close).
set -euo pipefail
LABEL="gui/$(id -u)/com.vitalink.presage-worker"
PLIST="$HOME/Library/LaunchAgents/com.vitalink.presage-worker.plist"

case "${1:-status}" in
  start)
    if [ -f "$PLIST" ]; then
      launchctl bootout "$LABEL" 2>/dev/null || true
      launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || true
      launchctl kickstart -k "$LABEL"
    else
      echo "LaunchAgent missing at $PLIST — reinstall from Cursor instructions."
      exit 1
    fi
    sleep 2
    curl -sS http://127.0.0.1:8787/health; echo
    ;;
  stop)
    launchctl bootout "$LABEL" 2>/dev/null || true
    pkill -f 'presage-worker/node_modules/.bin/tsx src/index.ts' 2>/dev/null || true
    echo "stopped"
    ;;
  status)
    launchctl print "$LABEL" 2>&1 | rg 'state =|pid =' | head -8 || echo "not loaded"
    curl -sS -m 2 http://127.0.0.1:8787/health || echo "health: down"
    echo
    ;;
  logs)
    tail -n 80 ~/Library/Logs/VitaLink/presage-worker.err.log
    ;;
  *)
    echo "Usage: $0 {start|stop|status|logs}"
    exit 1
    ;;
esac
