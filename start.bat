@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "URL=http://localhost:8000"
echo Проекция: %URL%
echo Не закрывайте это окно, пока пользуетесь программой.
rem Открываем в Chrome или Edge: Яндекс.Браузер и старые браузеры некоторые магазины (Zalando) не пускают
set "BR="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BR=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BR if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BR=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BR if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BR=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined BR if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BR=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BR if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BR=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if defined BR (start "" "%BR%" "%URL%") else (start "" "%URL%")
where node >nul 2>nul && (node scripts\serve.mjs) || (cd www && (py -m http.server 8000 || python -m http.server 8000))
if errorlevel 1 (
  echo Нужен Node.js (https://nodejs.org) или Python (https://python.org).
  pause
)
