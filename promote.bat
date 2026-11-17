@echo off
rem Promote to production with one double-click, no YES question (the owner, 17 Nov 2026).
rem Runs tools\promote.ps1 -Yes from the folder this file sits in (C:\JerseyQC on the
rem server PC): it lists what is promoted, backs up the data file, pulls the production
rem branch and says whether the server reloads. The window stays open to read it.
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0tools\promote.ps1" -Yes
echo.
pause
