@echo off
cd /d "%~dp0"
title Jersey QC Scanner - server (keep this window open)
echo.
echo  ===============================================
echo    Jersey QC Scanner - server
echo  ===============================================
echo.
echo    SUPERVISOR (this PC):
echo      https://localhost:5173/?station=supervisor
echo.
echo    STATIONS (other PCs - use the address of the
echo    network they are on; Wi-Fi laptops use the Wi-Fi line):
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } | ForEach-Object { '      ' + $_.InterfaceAlias.PadRight(14) + ' https://' + $_.IPAddress + ':5173/' }"
echo.
echo    At sign-in: Inspector then Station 1 / 2 / 3, or Packer,
echo    or Supervisor.  PINs: Station 1 = 1001, Station 2 = 1002,
echo    Station 3 = 1003, Packer = 2222, Supervisor = 3333
echo    (change them in .env.local).
echo    Other PCs see a certificate warning once:
echo    Advanced, then Proceed. Then allow the camera.
echo.

rem ---- Firewall: other PCs cannot connect until port 5173 is allowed in. ----
netsh advfirewall firewall show rule name="Jersey QC 5173" | find /i "Rule Name" >nul
if errorlevel 1 (
  echo    !! Windows Firewall is still BLOCKING other PCs on port 5173.
  echo       Adding the rule needs admin rights - Windows will ask.
  choice /c YN /n /m "       Add the firewall rule now? [Y/N] "
  if not errorlevel 2 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process netsh -ArgumentList 'advfirewall firewall add rule name=\"Jersey QC 5173\" dir=in action=allow protocol=TCP localport=5173 profile=domain,private' -Verb RunAs -Wait"
    netsh advfirewall firewall show rule name="Jersey QC 5173" | find /i "Rule Name" >nul
    if errorlevel 1 (echo       Rule NOT added - other PCs still blocked.) else (echo       Rule added - other PCs can connect.)
  )
  echo.
)

if not exist "node_modules" (
  echo    First run - installing dependencies...
  call npm install
)

echo    Starting... the supervisor page opens by itself in a few seconds.
echo    KEEP THIS WINDOW OPEN. Close it to stop the server.
echo.
start "" /min cmd /c "timeout /t 6 /nobreak >nul & start "" https://localhost:5173/?station=supervisor"
call npm run dev
echo.
echo  Server stopped.
pause
