@echo off
rem The TESTING server's folder takes what was promoted to testing, with one
rem double-click (the owner, 19 Nov 2026). Runs tools\pull-testing.ps1 from the
rem folder this file sits in, which must be on the testing branch. The window stays open.
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0tools\pull-testing.ps1"
echo.
pause
