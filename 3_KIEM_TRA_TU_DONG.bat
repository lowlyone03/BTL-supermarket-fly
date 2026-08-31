@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo SUPERMARKET FLY - KIEM TRA TU DONG
echo ==============================================

call npm run test:next

if errorlevel 1 (
  echo.
  echo [FAIL] Co kiem tra khong dat. Hay chup cua so nay gui nguoi phat trien.
  pause
  exit /b 1
)

echo.
echo ==============================================
echo PASS - TAT CA KIEM TRA TU DONG DA DAT
echo ==============================================
pause
exit /b 0
