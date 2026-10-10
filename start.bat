@echo off
chcp 65001 >nul
REM SchoolPro — Windows uchun ishga tushirish (ikki marta bosing)
cd /d "%~dp0"
if not exist backend\frontend_build\index.html (
  where npm >nul 2>nul || (echo Node.js topilmadi: https://nodejs.org & pause & exit /b 1)
  echo Frontend yig'ilmoqda...
  pushd frontend && call npm install --no-audit --no-fund && call npm run build && popd
)
cd backend
if not exist venv (
  echo Birinchi ishga tushirish: kutubxonalar o'rnatilmoqda...
  python -m venv venv
)
call venv\Scripts\activate.bat
python -m pip install -q --upgrade pip
pip install -q -r requirements.txt
python manage.py start
pause
