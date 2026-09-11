@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ==============================================
echo SUPERMARKET FLY - APP + TUNNEL ZALOPAY
echo Tunnel truoc, ghi .env, roi moi npm start.
echo Giu 2 cua so: tunnel + app. Tat tunnel = link doi.
echo ==============================================
echo.

if not exist "%~dp0scripts\start-app-with-momo-tunnel.ps1" (
  echo [LOI] Thieu scripts\start-app-with-momo-tunnel.ps1
  echo Hay keo du project, roi chay lai file nay.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-app-with-momo-tunnel.ps1"
set "APP_EXIT=%ERRORLEVEL%"

if not "%APP_EXIT%"=="0" (
  echo.
  echo [LOI] Khong khoi dong duoc app + tunnel ZaloPay.
  echo Thieu cloudflared.exe: xem docs\HUONG_DAN_CLOUDFLARE_TUNNEL.md phan A1.
  echo Hay chup toan bo cua so nay.
)

echo.
pause
exit /b %APP_EXIT%
