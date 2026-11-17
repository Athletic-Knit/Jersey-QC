# Moves what is ready in DEVELOPMENT to PRODUCTION. Run it in the production
# folder, on a break or when the owner says so, never while an operator is
# scanning:
#   powershell -ExecutionPolicy Bypass -File tools\promote.ps1          shows what would change and asks
#   powershell -ExecutionPolicy Bypass -File tools\promote.ps1 -Check   only shows, changes nothing
# It takes the `development` branch from GitHub (so development must be pushed
# first), keeps a copy of the data file, and fast-forwards `production` to it.
# The floor's server runs out of this folder and reloads by itself when the
# files change; if a server file is among them the stations show "Resume".
param([switch]$Check, [switch]$Yes)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$branch = (git branch --show-current).Trim()
if ($branch -ne "production") { Write-Host "This folder is on '$branch', not 'production'. Run this in the production folder." -ForegroundColor Red; exit 2 }
$dirty = @(git status --porcelain --untracked-files=no | Where-Object { $_ -notmatch '\.claude/' })
if ($dirty.Count) { Write-Host "Production has changes that were made by hand and never committed:" -ForegroundColor Red; $dirty | ForEach-Object { Write-Host "  $_" }; Write-Host "Nothing was changed. Sort these out first."; exit 2 }

git fetch -q origin
$waiting = @(git log --oneline "production..origin/development")
if (-not $waiting.Count) { Write-Host "Production already has everything that is in development. Nothing to do."; exit 0 }

Write-Host ""
Write-Host "Waiting in development ($($waiting.Count)):" -ForegroundColor Cyan
$waiting | ForEach-Object { Write-Host "  $_" }
$files = @(git diff --name-only "production..origin/development")
# Saving one of these makes the server reload itself: every station's page reloads and shows Resume.
$serverFiles = @($files | Where-Object { $_ -match '^(hub-plugin\.js|vite\.config\.js|src/lib/(labels|roster|boxmodel)\.js|package(-lock)?\.json)$' })
Write-Host ""
Write-Host "Files that change: $($files.Count)"
if ($serverFiles.Count) {
  Write-Host "The server will reload (stations show Resume, a few seconds) because of:" -ForegroundColor Yellow
  $serverFiles | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Host "Screen changes only: the server keeps running and pages update by themselves." -ForegroundColor Green
}
if ($Check) { Write-Host ""; Write-Host "Check only: nothing was changed."; exit 0 }

if (-not $Yes) {
  Write-Host ""
  $answer = Read-Host "Is the floor on a break, and may production change now? Type YES to go ahead"
  if ($answer -cne "YES") { Write-Host "Nothing was changed."; exit 0 }
}

# A copy of the data file first, outside anything git or the server touches.
$data = Join-Path $root "data\hub.json"
if (Test-Path $data) {
  $keep = Join-Path $root "data\backups"
  New-Item -ItemType Directory -Force -Path $keep | Out-Null
  $copy = Join-Path $keep ("hub-" + (Get-Date -Format "yyyy-MM-dd_HHmmss") + ".json")
  Copy-Item $data $copy
  Write-Host "Data file copied to $copy"
}

$before = (git rev-parse --short HEAD).Trim()
git merge -q --ff-only origin/development
if ($LASTEXITCODE -ne 0) { Write-Host "Could not fast-forward production to development. Nothing was changed." -ForegroundColor Red; exit 1 }
git push -q origin production
$after = (git rev-parse --short HEAD).Trim()
Write-Host ""
Write-Host "Production moved from $before to $after." -ForegroundColor Green
Write-Host "To go back: git reset --hard $before   (then git push --force-with-lease origin production)"
