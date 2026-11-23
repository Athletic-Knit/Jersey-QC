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
# When the packages change (package.json or package-lock.json), production's own
# packages are made again with `npm ci`, the floor's server stopped meanwhile and
# started again after (code review M21: a promoted package change was never installed).
param([switch]$Production, [switch]$Check, [switch]$Yes)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
. (Join-Path $PSScriptRoot "stagelib.ps1")

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
# The configs (vite.config.stage.js runs development and testing), the two server plugins, and
# every file hub-plugin.js imports, also through another file (labels.js imports roster.js).
# replay-plugin.js imports nothing of ours. A new import in either plugin goes in this list too
# (code review, 23 Nov 2026: the stage config and the replay plugin were missing).
$serverFiles = @($files | Where-Object { $_ -match '^(hub-plugin\.js|replay-plugin\.js|vite\.config(\.stage)?\.js|src/lib/(labels|roster|boxmodel)\.js|package(-lock)?\.json)$' })
Write-Host ""
Write-Host "Files that change: $($files.Count)"
if ($serverFiles.Count) {
  Write-Host "The $toName server will reload (stations show Resume, a few seconds) because of:" -ForegroundColor Yellow
  $serverFiles | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Host "Screen changes only: the server keeps running and pages update by themselves." -ForegroundColor Green
}
$packagesChange = [bool]@($files | Where-Object { $_ -match '^package(-lock)?\.json$' }).Count
if ($packagesChange -and $Production) { Write-Host "The packages change: the floor's server STOPS while they are installed (a minute or two), then starts again." -ForegroundColor Yellow }
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

# A copy of the data first, outside anything git or the server touches: the data file and
# the unfinished orders kept whole on disk (data\hub-orders), which were not copied before (M21).
$copy = Backup-Data $root
if ($copy) { Write-Host "Data copied to $copy" }

# The packages change: the floor's server is stopped first, so it never runs on half of them.
$task = Get-ScheduledTask -TaskName "Jersey QC server" -ErrorAction SilentlyContinue
if ($packagesChange) {
  if ($task) {
    Stop-ScheduledTask -TaskName "Jersey QC server" -ErrorAction SilentlyContinue
    # Still running, the task would start the server again in the middle of the install (it restarts on exit).
    if ((Get-ScheduledTask -TaskName "Jersey QC server").State -eq "Running") { Write-Host "The 'Jersey QC server' task did not stop. Nothing was changed." -ForegroundColor Red; exit 1 }
  }
  if (-not (Stop-PortServer 5173)) {
    Write-Host "The floor's server on port 5173 did not stop. Nothing was changed." -ForegroundColor Red
    if ($task) { Start-ScheduledTask -TaskName "Jersey QC server" }
    exit 1
  }
  Write-Host "The floor's server is stopped for the install." -ForegroundColor Yellow
}

$before = (git rev-parse --short HEAD).Trim()
git merge -q --ff-only origin/testing
if ($LASTEXITCODE -ne 0) {
  Write-Host "Could not fast-forward production to testing. Nothing was changed." -ForegroundColor Red
  if ($packagesChange -and $task) { Start-ScheduledTask -TaskName "Jersey QC server"; Write-Host "The floor's server is started again." }
  exit 1
}
git push -q origin production
$pushed = ($LASTEXITCODE -eq 0)
$after = (git rev-parse --short HEAD).Trim()
Write-Host ""
Write-Host "Production moved from $before to $after." -ForegroundColor Green
# The move here stands either way (the floor runs from this folder); only GitHub is behind
# (code review, 23 Nov 2026: a failed push used to go unsaid).
if (-not $pushed) {
  Write-Host "BUT GitHub was NOT updated: the push of production failed. Production moved on this PC only." -ForegroundColor Red
  Write-Host "When GitHub answers again, push it from $($root):  git push origin production" -ForegroundColor Red
}
if ($packagesChange) {
  if (-not (Install-Packages $root)) {
    Write-Host "The packages could NOT be installed, and the floor's server is STOPPED." -ForegroundColor Red
    Write-Host "Either run 'npm ci' in $root and start the 'Jersey QC server' task, or go back:" -ForegroundColor Red
    Write-Host "  git reset --hard $before, then npm ci, then start the 'Jersey QC server' task (and git push --force-with-lease origin production)" -ForegroundColor Red
    exit 1
  }
  if ($task) { Start-ScheduledTask -TaskName "Jersey QC server"; Write-Host "Packages installed; the floor's server is started again." -ForegroundColor Green }
  else { Write-Host "Packages installed. Start the floor's server again (Servers\Production server.bat)." -ForegroundColor Yellow }
}
$undoPackages = if ($packagesChange) { "; and npm ci with the server stopped" } else { "" }
Write-Host "To go back: git reset --hard $before   (then git push --force-with-lease origin production$undoPackages)"
