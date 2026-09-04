@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo SUPERMARKET FLY - MAY THANH VIEN
echo File nay CHI mo ung dung desktop.
echo Database nam tren may chu nhom, khong can SQL Server.
echo.
echo Sau khi cua so dang nhap mo:
echo 1. O "May chu nhom" nhap IP may chu, vi du 192.168.1.10
echo 2. Bam Kiem tra
echo 3. Bam nut vai tro cua ban (admin / muahang / thukho / thungan / ketoan)
echo 4. Bam Dang nhap — de nguyen may chay, khong dang xuat de doi vai tro
echo ==============================================
echo.

call npm run start:desktop
set "APP_EXIT=%ERRORLEVEL%"

if not "%APP_EXIT%"=="0" (
  echo.
  echo [LOI] Ung dung khong mo duoc.
  echo Hay chup toan bo cua so nay gui nguoi phat trien.
)

pause
exit /b %APP_EXIT%
