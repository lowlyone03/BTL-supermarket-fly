@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo SUPERMARKET FLY - CAI DAT LAN DAU
echo ==============================================

where node >nul 2>&1
if errorlevel 1 goto node_error

where npm >nul 2>&1
if errorlevel 1 goto npm_error

echo [1/3] Cai thu vien thu muc goc...
call npm install
if errorlevel 1 goto install_error

echo [2/3] Cai thu vien server...
pushd server
call npm install
if errorlevel 1 goto install_error_pop
popd

echo [3/3] Cai thu vien desktop...
pushd desktop
call npm install
if errorlevel 1 goto install_error_pop
popd

echo.
echo ==============================================
echo CAI DAT THANH CONG
echo Bay gio:
echo  - Test mot minh: 2_CHAY_SUPERMARKET_FLY.bat
echo  - May chu nhom:  4_CHAY_MAY_CHU_NHOM.bat
echo  - May thanh vien: 5_CHAY_MAY_THANH_VIEN.bat
echo ==============================================
pause
exit /b 0

:install_error_pop
popd
:install_error
echo.
echo [LOI] Khong cai duoc thu vien. Hay chup cua so nay gui nguoi phat trien.
pause
exit /b 1

:node_error
echo [LOI] May chua cai Node.js. Can cai Node.js 22 tro len.
pause
exit /b 1

:npm_error
echo [LOI] Khong tim thay npm. Hay cai lai Node.js.
pause
exit /b 1
