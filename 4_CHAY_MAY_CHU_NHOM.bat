@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo SUPERMARKET FLY - MAY CHU NHOM
echo Mot may nay giu SQL Server + API + database.
echo Thanh vien khac chi mo app va nhap IP ben duoi.
echo Khong dong cua so nay trong luc ca nhom test.
echo ==============================================
echo.

netsh advfirewall firewall show rule name="Supermarket Fly API" >nul 2>&1
if errorlevel 1 (
  echo Dang mo cong 3000 tren Windows Firewall...
  netsh advfirewall firewall add rule name="Supermarket Fly API" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
  if errorlevel 1 (
    echo [CANH BAO] Chua mo duoc firewall. Hay chay lai file nay bang "Run as administrator"
    echo hoac tu mo cong TCP 3000 inbound.
    echo.
  ) else (
    echo Da mo cong 3000.
    echo.
  )
)

echo IP may nay de thanh vien nhap o man dang nhap:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | ForEach-Object { '  ' + $_.IPAddress }"
echo.
echo Neu khong thay IP, mo Wi-Fi/Ethernet roi chay lai file nay.
echo.

call npm run start:server
set "APP_EXIT=%ERRORLEVEL%"

if not "%APP_EXIT%"=="0" (
  echo.
  echo [LOI] May chu khong khoi dong duoc.
  echo Hay chup toan bo cua so nay.
)

pause
exit /b %APP_EXIT%
