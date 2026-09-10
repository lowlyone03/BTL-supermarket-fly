@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo SUPERMARKET FLY - DANG KHOI DONG
echo Khong dong cua so nay trong luc test.
echo Test thuong: file nay / npm start (khong can cloudflared).
echo Test MoMo:   7_CHAY_APP_VA_TUNNEL_MOMO.bat / npm run start:momo
echo ==============================================

call npm start
set "APP_EXIT=%ERRORLEVEL%"

if not "%APP_EXIT%"=="0" (
  echo.
  echo [LOI] He thong khong khoi dong duoc.
  echo Hay chup toan bo cua so nay gui nguoi phat trien.
)

pause
exit /b %APP_EXIT%
