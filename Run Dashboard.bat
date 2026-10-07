@echo off
cd /d "%~dp0"
echo Starting FPL dashboard...
start "FPL Dashboard Server" cmd /k npm run dev
timeout /t 4 /nobreak >nul
start "" http://localhost:5173
