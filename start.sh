#!/usr/bin/env bash
# SchoolPro — Linux / macOS / server uchun ishga tushirish
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
if [ ! -f "$ROOT/backend/frontend_build/index.html" ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "Frontend yig'ilmoqda (bir marta, 1–2 daqiqa)..."
    (cd "$ROOT/frontend" && npm install --no-audit --no-fund && npm run build)
  else
    echo "⚠️  Node.js topilmadi. https://nodejs.org dan o'rnating va qayta ishga tushiring."
    exit 1
  fi
fi
cd "$ROOT/backend"
if [ ! -d venv ]; then
  echo "Birinchi ishga tushirish: Python kutubxonalari o'rnatilmoqda..."
  python3 -m venv venv
fi
source venv/bin/activate
pip install -q --upgrade pip >/dev/null
pip install -q -r requirements.txt
exec python manage.py start "$@"
