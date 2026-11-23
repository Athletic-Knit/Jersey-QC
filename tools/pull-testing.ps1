# The TESTING server's folder takes what was promoted to testing (the owner,
# 19 Nov 2026). Run it in the testing folder, on the `testing` branch:
#   powershell -ExecutionPolicy Bypass -File tools\pull-testing.ps1
# Keeps a copy of the testing data (the data file and the unfinished orders),
# then fast-forwards to origin/testing. The testing server reloads by itself
# when the files change. When the packages changed, or the folder still links
# another folder's packages, the testing server is stopped and the folder's own
# packages are made (npm ci); Testing server.bat starts it again (code review M21).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
. (Join-Path $PSScriptRoot "stagelib.ps1")
$branch = (git branch --show-current).Trim()
if ($branch -ne "testing") { Write-Host "This folder is on '$branch', not 'testing'. Run this in the testing folder." -ForegroundColor Red; exit 2 }
$dirty = @(git status --porcelain --untracked-files=no | Where-Object { $_ -notmatch '\.claude/' })
if ($dirty.Count) { Write-Host "Testing has changes that were made by hand and never committed:" -ForegroundColor Red; $dirty | ForEach-Object { Write-Host "  $_" }; Write-Host "Nothing was changed."; exit 2 }
git fetch -q origin
if ($LASTEXITCODE -ne 0) { Write-Host "Could not reach GitHub (git fetch failed). Nothing was changed." -ForegroundColor Red; exit 1 }
$waiting = @(git log --oneline "testing..origin/testing")
if (-not $waiting.Count) { Write-Host "Testing already has everything promoted to it. Nothing to do."; exit 0 }
Write-Host "Taking $($waiting.Count) change(s):" -ForegroundColor Cyan
$waiting | ForEach-Object { Write-Host "  $_" }
$copy = Backup-Data $root
if ($copy) { Write-Host "Data copied to $copy" }
$before = (git rev-parse --short HEAD).Trim()
git merge -q --ff-only origin/testing
if ($LASTEXITCODE -ne 0) { Write-Host "Could not fast-forward testing. Nothing was changed." -ForegroundColor Red; exit 1 }
Write-Host "Testing moved from $before to $((git rev-parse --short HEAD).Trim())." -ForegroundColor Green
$need = Get-PackagesNeed $root
if ($need) {
  Write-Host "The testing packages must be made ($need): the testing server stops for it." -ForegroundColor Yellow
  if (-not (Stop-PortServer 5175)) { Write-Host "The testing server on port 5175 did not stop: close its window and run this again." -ForegroundColor Red; exit 1 }
  if (-not (Install-Packages $root)) { Write-Host "The packages could NOT be installed. Run 'npm ci' in $root, then Testing server.bat." -ForegroundColor Red; exit 1 }
  Write-Host "Packages installed. Start the testing server again with Testing server.bat." -ForegroundColor Green
}
