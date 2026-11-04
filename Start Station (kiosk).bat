@echo off
setlocal EnableDelayedExpansion
rem  Opens this PC's station in Microsoft Edge KIOSK mode: full screen, no
rem  address bar, no tabs, no menus, no other sites. The operator can only use
rem  the station. Alt+F4 closes it (a supervisor's job).
rem
rem  First run asks for the server address and which station this PC is, and
rem  keeps the answers in %APPDATA%\JerseyQC\station.cfg. Delete that file to
rem  be asked again. Put a shortcut to this file in the Startup folder
rem  (Win+R, shell:startup) and the station opens by itself at log-on.

set "CFG=%APPDATA%\JerseyQC\station.cfg"
if exist "%CFG%" (
  for /f "usebackq tokens=1,* delims==" %%a in ("%CFG%") do (
    if /i "%%a"=="server"  set "SERVER=%%b"
    if /i "%%a"=="station" set "STATION=%%b"
  )
)
if not defined SERVER (
  echo.
  echo  Jersey QC - station set-up ^(asked once^)
  echo.
  echo  The server address is shown in the "Jersey QC Scanner - server"
  echo  window on the supervisor's PC, e.g. https://10.61.28.136:5173
  set /p "SERVER=  Server address: "
)
if not defined STATION (
  set /p "STATION=  Which station is this PC? (station1 / station2 / station3 / packing): "
)
set "SERVER=%SERVER: =%"
set "STATION=%STATION: =%"
if "%SERVER:~-1%"=="/" set "SERVER=%SERVER:~0,-1%"
if not exist "%APPDATA%\JerseyQC" mkdir "%APPDATA%\JerseyQC"
> "%CFG%" echo server=%SERVER%
>> "%CFG%" echo station=%STATION%

set "URL=%SERVER%/?station=%STATION%"

rem  Edge ships with Windows. Its own profile folder keeps the station's sign-in
rem  and saved order apart from anyone's personal browsing. The server's
rem  certificate is self-signed on the LAN: the first time, the kiosk shows the
rem  certificate warning page - click Advanced, then Continue - and remembers
rem  the choice for this profile. (A real certificate on the server removes it.)
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --kiosk "%URL%" --edge-kiosk-type=fullscreen --no-first-run --user-data-dir="%APPDATA%\JerseyQC\edge-profile" --autoplay-policy=no-user-gesture-required
  exit /b 0
)

rem  No Edge: Chrome's kiosk mode is the same idea.
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --kiosk "%URL%" --no-first-run --user-data-dir="%APPDATA%\JerseyQC\chrome-profile" --autoplay-policy=no-user-gesture-required
  exit /b 0
)

echo.
echo  Neither Microsoft Edge nor Google Chrome was found on this PC.
echo  Install one, then run this file again.
pause
