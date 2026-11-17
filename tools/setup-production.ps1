# Moves PRODUCTION out of OneDrive. Run it ONCE, ON THE SERVER PC, on a break
# (stations are cut off for about a minute):
#   powershell -ExecutionPolicy Bypass -File tools\setup-production.ps1 -Check   says what it would do, changes nothing
#   powershell -ExecutionPolicy Bypass -File tools\setup-production.ps1          does it (asks for YES first)
# and afterwards ON THE OTHER PC (the development laptop), so only one server is left:
#   powershell -ExecutionPolicy Bypass -File tools\setup-production.ps1 -StopOnly
#
# Why: the floor's server ran straight out of a OneDrive folder that two PCs
# share. Code arrived late and a file at a time, both PCs wrote the same data
# file, and a change saved on one PC restarted the server on the other. After
# this, production is its own folder on the server PC (default C:\JerseyQC),
# on the `production` branch from GitHub, with its own data file; it changes
# only when tools\promote.ps1 is run in it.
#
# What it does, in order:
#   1. copies the `production` branch into the new folder (from this folder's
#      git, so no sign-in is needed) and points it at GitHub for later updates
#   2. copies .env.local (the API key and printer names) and the installed
#      packages (no download)
#   3. stops the old server
#   4. puts the data back into ONE file in the new folder: the old data file,
#      this PC's OneDrive conflict copy and any copy the hub set aside, merged
#      (tools\merge-hub-data.mjs), so no history is lost
#   5. makes the "Jersey QC server" task start from the new folder, starts it,
#      and checks it answers and how many days of history it has
# Nothing in the old folder is deleted. To go back: run
# tools\install-autostart.ps1 in the old folder, then schtasks /Run /TN "Jersey QC server".
param(
  [string]$Target = "C:\JerseyQC",
  [string]$From = "",
  [switch]$Check,
  [switch]$Yes,
  [switch]$StopOnly
)
$ErrorActionPreference = "Stop"
$task = "Jersey QC server"
if (-not $From) { $From = Split-Path -Parent $PSScriptRoot }
function Say($t, $c = "Gray") { Write-Host $t -ForegroundColor $c }
function Step($t) { Write-Host ""; Write-Host $t -ForegroundColor Cyan }
function Stop-Server {
  schtasks /End /TN $task 2>$null | Out-Null
  Start-Sleep -Seconds 2
  $c = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }
  -not (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)
}

# ── The other PC: only stop its copy of the server ───────────────────────────
if ($StopOnly) {
  Say "This PC: $env:COMPUTERNAME. Stopping its copy of the Jersey QC server and switching its auto-start off." "Cyan"
  if (-not $Yes) { $a = Read-Host "This is NOT the server PC, and its server copy should stop for good? Type YES"; if ($a -cne "YES") { Say "Nothing was changed."; exit 0 } }
  $stopped = Stop-Server
  try { Disable-ScheduledTask -TaskName $task -ErrorAction Stop | Out-Null; Say "Auto-start switched off (the task is kept, disabled)." "Green" } catch { Say "Could not switch the auto-start off: $($_.Exception.Message)" "Yellow" }
  if ($stopped) { Say "No server is running on this PC now. Stations must use the server PC's address." "Green" } else { Say "Something is still listening on port 5173 on this PC." "Red"; exit 1 }
  exit 0
}

# ── The server PC ────────────────────────────────────────────────────────────
Say "Jersey QC: move production out of OneDrive" "Cyan"
Say "  this PC:     $env:COMPUTERNAME"
Say "  from:        $From"
Say "  new folder:  $Target"
$problems = @()
if ($Target -match "OneDrive") { $problems += "The new folder must not be inside OneDrive." }
foreach ($tool in "git", "node") { if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { $problems += "'$tool' is not installed on this PC." } }
if (-not (Test-Path (Join-Path $From ".git"))) { $problems += "The folder this script is in is not the project's git folder." }
if (-not (Test-Path (Join-Path $From ".env.local"))) { $problems += "No .env.local in $From (the API key and printer names)." }
if (-not (Test-Path (Join-Path $From "node_modules\vite"))) { $problems += "No installed packages in $From\node_modules." }
if ((Test-Path $Target) -and -not (Test-Path (Join-Path $Target ".git")) -and @(Get-ChildItem $Target -Force -ErrorAction SilentlyContinue).Count) { $problems += "$Target exists and is not empty." }
$hasProd = (git -C $From rev-parse --verify --quiet "refs/heads/production") -or (git -C $From rev-parse --verify --quiet "refs/remotes/origin/production")
if (-not $hasProd) { $problems += "This folder's git has no 'production' branch yet (has OneDrive finished syncing?)." }
if ($problems.Count) { Step "Cannot go ahead:"; $problems | ForEach-Object { Say "  - $_" "Red" }; exit 2 }

# The copies of the data file that hold history, oldest knowledge first, the live file last.
$dataDir = Join-Path $From "data"
$copies = @()
$copies += @(Get-ChildItem $dataDir -Filter "hub.json.unreadable-*" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | ForEach-Object { $_.FullName })
$conflict = Get-ChildItem $dataDir -Filter "hub-$($env:COMPUTERNAME)-*.json" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
if ($conflict) { $copies += $conflict.FullName }
if (Test-Path (Join-Path $dataDir "hub.json")) { $copies += (Join-Path $dataDir "hub.json") }

Step "Plan"
Say "  1. copy the 'production' branch into $Target and point it at GitHub"
Say "  2. copy .env.local and the installed packages (no download)"
Say "  3. stop the server that runs from the OneDrive folder"
Say "  4. merge the data into $Target\data\hub.json from:"
if ($copies.Count) { $copies | ForEach-Object { Say "       $(Split-Path $_ -Leaf)" } } else { Say "       (no data file found: the hub starts empty)" "Yellow" }
Say "  5. start the server from $Target and check it"
if ($Check) { Say ""; Say "Check only: nothing was changed." "Green"; exit 0 }
if (-not $Yes) {
  Write-Host ""
  $a = Read-Host "Is the floor on a break? Stations are cut off for about a minute. Type YES to go ahead"
  if ($a -cne "YES") { Say "Nothing was changed."; exit 0 }
}

Step "1. Copying the production branch"
if (-not (Test-Path (Join-Path $Target ".git"))) {
  git clone -q --branch production "$From" "$Target"
  if ($LASTEXITCODE -ne 0) { Say "Could not copy the branch. Nothing else was changed." "Red"; exit 1 }
}
git -C $Target remote set-url origin "https://github.com/Athletic-Knit/Jersey-QC.git"
$name = (git -C $From config user.name); $mail = (git -C $From config user.email)
if ($name) { git -C $Target config user.name "$name" }
if ($mail) { git -C $Target config user.email "$mail" }
git -C $Target fetch -q origin 2>$null
if ($LASTEXITCODE -eq 0) {
  git -C $Target branch -q --set-upstream-to=origin/production production 2>$null | Out-Null
  git -C $Target merge -q --ff-only origin/production 2>$null | Out-Null   # OneDrive's copy of the branch may be a commit behind GitHub's
  Say "  GitHub answers: later updates come from there." "Green"
}
else { Say "  GitHub did not answer from this PC (no sign-in saved?). The folder is ready all the same; sign in before the first update." "Yellow" }
Say "  production is at: $((git -C $Target log --oneline -1))"

Step "2. Copying .env.local and the packages (about a minute)"
Copy-Item (Join-Path $From ".env.local") (Join-Path $Target ".env.local") -Force
robocopy (Join-Path $From "node_modules") (Join-Path $Target "node_modules") /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
if ($LASTEXITCODE -ge 8) { Say "Copying the packages failed (robocopy $LASTEXITCODE). The old server is still running; nothing else was changed." "Red"; exit 1 }
if (Test-Path (Join-Path $From "public\sim")) { robocopy (Join-Path $From "public\sim") (Join-Path $Target "public\sim") /E /NFL /NDL /NJH /NJS /NP | Out-Null }
$global:LASTEXITCODE = 0

Step "3. Stopping the old server"
if (-not (Stop-Server)) { Say "The old server would not stop (port 5173 is still in use). Nothing else was changed." "Red"; exit 1 }
Say "  stopped."

Step "4. Putting the data into one file"
New-Item -ItemType Directory -Force -Path (Join-Path $Target "data") | Out-Null
$newData = Join-Path $Target "data\hub.json"
if (Test-Path $newData) { Copy-Item $newData ($newData + ".before-setup-" + (Get-Date -Format "yyyyMMdd_HHmmss")) }
if ($copies.Count) {
  & node (Join-Path $Target "tools\merge-hub-data.mjs") --out $newData @copies
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $newData)) { Say "The data could not be merged. Starting the OLD server again; nothing was lost." "Red"; & (Join-Path $From "tools\install-autostart.ps1"); schtasks /Run /TN $task | Out-Null; exit 1 }
} else { Say "  no data file to bring over." "Yellow" }

Step "5. Starting the server from $Target"
& (Join-Path $Target "tools\install-autostart.ps1")
schtasks /Run /TN $task | Out-Null
$up = $false
foreach ($i in 1..40) { Start-Sleep -Seconds 1; if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) { $up = $true; break } }
if (-not $up) { Say "The new server did not come up on port 5173. Look at $Target\data\server.log. To go back: run tools\install-autostart.ps1 in $From, then schtasks /Run /TN `"$task`"." "Red"; exit 1 }
Start-Sleep -Seconds 3
try {
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
  [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
  $ledger = Invoke-RestMethod -Uri "https://localhost:5173/api/hub/ledger" -TimeoutSec 20
  Say "  the server answers and has $(@($ledger.days).Count) days of history loaded." "Green"
} catch { Say "  the server is up, but its history could not be read just now: $($_.Exception.Message)" "Yellow" }

"Production moved to $Target on $env:COMPUTERNAME on $(Get-Date -Format 'yyyy-MM-dd HH:mm'). This OneDrive folder is no longer what the floor runs. Nothing here was deleted." | Set-Content -Path (Join-Path $From "PRODUCTION-MOVED.txt") -Encoding ascii

Step "Done"
Say "  Stations and the supervisor use:  https://$($env:COMPUTERNAME):5173/" "Green"
Say "  They reload their page once and press Resume."
Say "  On the OTHER PC, so only one server is left, run:"
Say "    powershell -ExecutionPolicy Bypass -File tools\setup-production.ps1 -StopOnly"
Say "  Updates from now on: in $Target, on a break:"
Say "    powershell -ExecutionPolicy Bypass -File tools\promote.ps1"
