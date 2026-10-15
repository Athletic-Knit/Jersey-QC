@echo off
cd /d "%~dp0"
title Jersey QC Scanner - NETWORK MODE
setlocal enabledelayedexpansion
set IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  if not defined IP set IP=%%a
)
set IP=%IP: =%
echo.
echo  ===============================================
echo    Jersey QC Scanner - shared on the network
echo  ===============================================
echo.
echo    This PC:     https://localhost:5173
echo    Other PCs:   https://%IP%:5173
echo.
echo    Other machines will show a certificate warning.
echo    Click "Advanced" then "Proceed" - that is expected
echo    with a self-signed certificate, and is required
echo    for the camera to work.
echo.
echo    KEEP THIS WINDOW OPEN. Close it to stop the server.
echo.
if not exist "node_modules" (
  echo    First run - installing dependencies...
  call npm install
)
call npm run dev -- --open
echo.
echo  Server stopped.
pause
