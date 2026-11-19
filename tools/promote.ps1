# Moves work one step along: DEVELOPMENT -> TESTING -> PRODUCTION (the owner,
# 19 Nov 2026: everything is tried on testing, a copy of production, before the
# floor gets it). Never while an operator is scanning:
#   powershell -ExecutionPolicy Bypass -File tools\promote.ps1                 development -> testing (GitHub only; any folder)
#   powershell -ExecutionPolicy Bypass -File tools\promote.ps1 -Production     testing -> production: run it in the production folder
#   ... -Check   only shows what would move
#   ... -Yes     no question
# To testing: the `testing` branch on GitHub moves forward to `development`
# (fast-forward only). A folder on the `testing` branch (the testing server)
# then takes it with tools\pull-testing.ps1.
# To production: in the production folder, keeps a copy of the data file and
# fast-forwards `production` to `testing`. The floor's server reloads by itself
# when the files change; if a server file is among them the stations show "Resume".
param([switch]$Production, [switch]$Check, [switch]$Yes)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

git fetch -q origin
if ($LASTEXITCODE -ne 0) { Write-Host "Could not reach GitHub (git fetch failed). Nothing was changed." -ForegroundColor Red; exit 1 }
$from = if ($Production) { "origin/testing" } else { "origin/development" }
$to   = if ($Production) { "production" } else { "origin/testing" }
$toName = if ($Production) { "production" } else { "testing" }

if ($Production) {
  $branch = (git branch --show-current).Trim()
  if ($branch -ne "production") { Write-Host "This folder is on '$branch', not 'production'. Run -Production in the production folder." -ForegroundColor Red; exit 2 }
  $dirty = @(git status --porcelain --untracked-files=no | Where-Object { $_ -notmatch '\.claude/' })
  if ($dirty.Count) { Write-Host "Production has changes that were made by hand and never committed:" -ForegroundColor Red; $dirty | ForEach-Object { Write-Host "  $_" }; Write-Host "Nothing was changed. Sort these out first."; exit 2 }
}
git rev-parse -q --verify $from *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "There is no $from on GitHub yet. Nothing was changed." -ForegroundColor Red; exit 2 }

$waiting = @(git log --oneline "$to..$from")
if (-not $waiting.Count) { Write-Host "$toName already has everything that is in $($from -replace '^origin/',''). Nothing to do."; exit 0 }

Write-Host ""
Write-Host "Waiting to go to $($toName) ($($waiting.Count)):" -ForegroundColor Cyan
$waiting | ForEach-Object { Write-Host "  $_" }
$files = @(git diff --name-only "$to..$from")
# Saving one of these makes the server reload itself: every station's page reloads and shows Resume.
$serverFiles = @($files | Where-Object { $_ -match '^(hub-plugin\.js|vite\.config\.js|src/lib/(labels|roster|boxmodel)\.js|package(-lock)?\.json)$' })
Write-Host ""
Write-Host "Files that change: $($files.Count)"
if ($serverFiles.Count) {
  Write-Host "The $toName server will reload (stations show Resume, a few seconds) because of:" -ForegroundColor Yellow
  $serverFiles | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Host "Screen changes only: the server keeps running and pages update by themselves." -ForegroundColor Green
}
if ($Check) { Write-Host ""; Write-Host "Check only: nothing was changed."; exit 0 }

if (-not $Yes) {
  Write-Host ""
  $q = if ($Production) { "Is the floor on a break, and may production change now? Type YES to go ahead" } else { "Move these to testing now? Type YES to go ahead" }
  $answer = Read-Host $q
  if ($answer -cne "YES") { Write-Host "Nothing was changed."; exit 0 }
}

if (-not $Production) {
  git merge-base --is-ancestor origin/testing origin/development
  if ($LASTEXITCODE -ne 0) { Write-Host "testing has commits that development does not. Nothing was changed." -ForegroundColor Red; exit 1 }
  $before = (git rev-parse --short origin/testing).Trim()
  git push -q origin "origin/development:refs/heads/testing"
  if ($LASTEXITCODE -ne 0) { Write-Host "Could not push testing. Nothing was changed." -ForegroundColor Red; exit 1 }
  $after = (git rev-parse --short origin/development).Trim()
  Write-Host ""
  Write-Host "Testing moved from $before to $after on GitHub." -ForegroundColor Green
  Write-Host "The testing server takes it with tools\pull-testing.ps1 (or pull-testing.bat) in its folder."
  Write-Host "To go back: git push --force-with-lease origin $($before):refs/heads/testing"
  exit 0
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
git merge -q --ff-only origin/testing
if ($LASTEXITCODE -ne 0) { Write-Host "Could not fast-forward production to testing. Nothing was changed." -ForegroundColor Red; exit 1 }
git push -q origin production
$after = (git rev-parse --short HEAD).Trim()
Write-Host ""
Write-Host "Production moved from $before to $after." -ForegroundColor Green
Write-Host "To go back: git reset --hard $before   (then git push --force-with-lease origin production)"
