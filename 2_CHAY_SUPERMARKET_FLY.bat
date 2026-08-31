@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo SUPERMARKET FLY - DANG KHOI DONG
echo Khong dong cua so nay trong luc test.
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
