@echo off
rem Clears every label waiting in the Zebra's queue on this PC and says how
rem many were cleared and how many are left. See tools\clear-print-queue.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\clear-print-queue.ps1" %*
