#!/bin/sh
# Запуск «Проекции» на ноутбуке (macOS / Linux)
cd "$(dirname "$0")"
( sleep 1; (open http://localhost:8000 2>/dev/null || xdg-open http://localhost:8000 2>/dev/null) ) &
if command -v node >/dev/null 2>&1; then node scripts/serve.mjs
elif command -v python3 >/dev/null 2>&1; then cd www && python3 -m http.server 8000
else echo "Нужен Node.js (https://nodejs.org) или Python (https://python.org)"; read _; fi
