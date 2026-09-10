@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ==============================================
echo SUPERMARKET FLY - DUONG HAM CLOUDFLARE
echo Chi TV1 chay file nay. Thanh vien khong can cai.
echo Mo 4_CHAY_MAY_CHU_NHOM.bat TRUOC, roi moi mo file nay.
echo Khong dong cua so nay trong luc ca nhom test.
echo Test MoMo (ghi .env + start app): 7_CHAY_APP_VA_TUNNEL_MOMO.bat
echo ==============================================
echo.

set "CF="
if exist "%~dp0cloudflared.exe" set "CF=%~dp0cloudflared.exe"
if not defined CF if exist "%USERPROFILE%\Desktop\cloudflared.exe" set "CF=%USERPROFILE%\Desktop\cloudflared.exe"
if not defined CF if exist "%USERPROFILE%\Downloads\cloudflared.exe" set "CF=%USERPROFILE%\Downloads\cloudflared.exe"
if not defined CF if exist "%USERPROFILE%\Downloads\cloudflared-windows-amd64.exe" set "CF=%USERPROFILE%\Downloads\cloudflared-windows-amd64.exe"
if not defined CF if exist "%~dp0cloudflared-windows-amd64.exe" set "CF=%~dp0cloudflared-windows-amd64.exe"

if not defined CF (
  echo [LOI] Khong thay cloudflared.exe
  echo.
  echo Tai file nay bang trinh duyet:
  echo https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
  echo.
  echo Doi ten thanh cloudflared.exe
  echo Dat vao cung thu muc voi file .bat nay, roi chay lai.
  echo.
  pause
  exit /b 1
)

echo Dung file: %CF%
echo.

echo Dang kiem tra API http://localhost:3000 ...
powershell -NoProfile -Command "try { $r = Invoke-RestMethod 'http://localhost:3000/api/health' -TimeoutSec 4; if ($r.status -ne 'ok') { exit 2 } } catch { exit 1 }"
if errorlevel 1 (
  echo [LOI] API chua chay. Hay mo 4_CHAY_MAY_CHU_NHOM.bat truoc, doi dong "localhost:3000", roi chay lai file nay.
  echo.
  pause
  exit /b 1
)

echo API da san sang.
echo.
echo Dang tao link. Doi 5-15 giay, tim dong https://....trycloudflare.com
echo Copy NGUYEN dong https do gui nhom.
echo Thanh vien dan vao o "May chu nhom" roi bam Kiem tra.
echo.
echo Tat cua so nay thi link doi. Phai mo lai va gui link moi.
echo ==============================================
echo.

"%CF%" tunnel --url http://localhost:3000
set "APP_EXIT=%ERRORLEVEL%"

echo.
echo Duong ham da tat. Link cu khong dung duoc nua.
pause
exit /b %APP_EXIT%
