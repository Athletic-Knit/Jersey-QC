@echo off
rem Testing server.bat: one double-click promotes development to testing, takes it into C:\JerseyQC-testing and starts the testing server (port 5175) (the owner, 20 Nov 2026).
rem In the Servers folder; runs ..\tools\stage.ps1 -Stage testing. The window stays open.
title Jersey QC - TESTING server
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\tools\stage.ps1" -Stage testing
echo.
pause
