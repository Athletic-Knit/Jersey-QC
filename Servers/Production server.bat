@echo off
rem Production server.bat: one double-click on the server PC: promotes testing to production (after one Y) and makes sure the floor's server (port 5173) is running (the owner, 20 Nov 2026).
rem In the Servers folder; runs ..\tools\stage.ps1 -Stage production. The window stays open.
title Jersey QC - PRODUCTION server
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\tools\stage.ps1" -Stage production
echo.
pause
