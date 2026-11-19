@echo off
rem Move DEVELOPMENT to TESTING with one double-click, no YES question (the owner,
rem 19 Nov 2026). Runs tools\promote.ps1 -Yes: the testing branch on GitHub moves
rem forward to development. Any folder of this project will do. The testing server
rem then takes it with pull-testing.bat in its own folder.
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0tools\promote.ps1" -Yes
echo.
pause
