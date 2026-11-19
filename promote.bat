@echo off
rem Promote TESTING to PRODUCTION with one double-click, no YES question (the owner,
rem 17 and 19 Nov 2026). Runs tools\promote.ps1 -Production -Yes from the folder this
rem file sits in (C:\JerseyQC on the server PC): it lists what is promoted, backs up the
rem data file, moves the production branch to testing and says whether the server
rem reloads. Only what was tried on testing reaches the floor. The window stays open.
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0tools\promote.ps1" -Production -Yes
echo.
pause
