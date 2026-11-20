@echo off
rem Development server.bat: one double-click takes the newest development from GitHub and starts the development server (port 5174) (the owner, 20 Nov 2026).
rem In the Servers folder; runs ..\tools\stage.ps1 -Stage development. The window stays open.
title Jersey QC - DEVELOPMENT server
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\tools\stage.ps1" -Stage development
echo.
pause
