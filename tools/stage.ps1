# One double-click a stage (the owner, 20 Nov 2026: "3 bat files, development,
# test and production, when I click each it starts those servers and promotes
# the previous changes as well"). Run by the .bat files in the project folder:
#   Development server.bat   takes the newest development from GitHub into the
#                            development folder and starts its server (5174)
#   Testing server.bat       promotes development to testing, takes it into
#                            C:\JerseyQC-testing and starts the testing server (5175)
#   Production server.bat    promotes testing to production in C:\JerseyQC (on
#                            the server PC, after one Y) and makes sure the
#                            floor's server (5173) is running
# A server that is already running takes the new files by itself (stations
# show Resume when a server file changed). One that is not running is started:
# production by its "Jersey QC server" task, development and testing in this
# window (close the window to stop it). Each stage has its own folder and its
# own data file, so nothing done on development or testing touches the floor.
# A missing development or testing folder is made: cloned from GitHub, with
# .env.local copied and node_modules linked from production.
param([Parameter(Mandatory = $true)][ValidateSet("development", "testing", "production")][string]$Stage)
$ErrorActionPreference = "Continue"
$repo    = "https://github.com/Athletic-Knit/Jersey-QC.git"
$prodDir = "C:\JerseyQC"
$here    = Split-Path -Parent $PSScriptRoot
$dirs    = @{ development = (Join-Path $env:USERPROFILE "JerseyQC-dev"); testing = "C:\JerseyQC-testing"; production = $prodDir }
$ports   = @{ development = 5174; testing = 5175; production = 5173 }
$dir  = $dirs[$Stage]
$port = $ports[$Stage]
$NAME = $Stage.ToUpper()
$pc   = $env:COMPUTERNAME

function Say($t, $c = "Gray") { Write-Host $t -ForegroundColor $c }
function Step($t) { Write-Host ""; Write-Host $t -ForegroundColor Cyan }
function Answers { & curl.exe -sk -o NUL -m 5 "https://localhost:$port/" 2>$null; return ($LASTEXITCODE -eq 0) }
function Links {
  Step "Open it at:"
  Say "  This PC:     https://localhost:$port/?station=station1" White
  Say "  Other PCs:   https://$($pc):$port/?station=station1   (station2, station3; supervisor: no ?station)" White
  Say "  First time on a PC: the browser warns about the certificate. Click Advanced, then Continue."
}

Write-Host ""
Write-Host "  ==============================================" -ForegroundColor Cyan
Write-Host "    Jersey QC - $NAME server (port $port)" -ForegroundColor Cyan
Write-Host "  ==============================================" -ForegroundColor Cyan

# ---- The folder ----------------------------------------------------------
if ($Stage -eq "production") {
  if (-not (Test-Path (Join-Path $prodDir ".git"))) {
    Say ""
    Say "Production runs on the server PC, in $prodDir, and that folder is not on this PC ($pc)." Red
    Say "Run Production server.bat on the server PC. Nothing was changed." Red
    exit 2
  }
} elseif (-not (Test-Path (Join-Path $dir ".git"))) {
  Step "Making the $Stage folder: $dir"
  git clone -q --branch $Stage $repo $dir
  if ($LASTEXITCODE -ne 0) { Say "Could not copy the $Stage branch from GitHub. Nothing was started." Red; exit 1 }
}
foreach ($from in @($prodDir, $here)) {
  if ($from -eq $dir) { continue }
  if (-not (Test-Path (Join-Path $dir ".env.local")) -and (Test-Path (Join-Path $from ".env.local"))) {
    Copy-Item (Join-Path $from ".env.local") (Join-Path $dir ".env.local"); Say "Settings (.env.local) copied from $from"
  }
  if (-not (Test-Path (Join-Path $dir "node_modules")) -and (Test-Path (Join-Path $from "node_modules"))) {
    cmd /c mklink /J "$dir\node_modules" "$from\node_modules" | Out-Null; Say "Packages linked from $from"
  }
}
if (-not (Test-Path (Join-Path $dir "node_modules"))) {
  Step "Installing the packages (first run, a few minutes)"
  Push-Location $dir; npm.cmd install; Pop-Location
}
New-Item -ItemType Directory -Force (Join-Path $dir "data") | Out-Null

# ---- Promote the previous step and take it -------------------------------
Set-Location $dir
if ($Stage -eq "development") {
  Step "Taking the newest development from GitHub"
  git fetch -q origin; $fetched = ($LASTEXITCODE -eq 0)
  $branch = (git branch --show-current).Trim()
  $dirty  = @(git status --porcelain --untracked-files=no | Where-Object { $_ -notmatch '\.claude/' })
  if (-not $fetched) { Say "Could not reach GitHub: the server starts with what the folder has." Yellow }
  elseif ($branch -ne "development") { Say "The folder is on '$branch', not 'development': left as it is." Yellow }
  elseif ($dirty.Count) { Say "The folder has changes not committed yet (work in progress): left as it is." Yellow }
  else {
    $waiting = @(git log --oneline "HEAD..origin/development")
    if ($waiting.Count) { git merge -q --ff-only origin/development; Say "Took $($waiting.Count) change(s)." Green } else { Say "Already up to date." Green }
  }
} elseif ($Stage -eq "testing") {
  Step "1. Promoting development to testing (GitHub)"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir "tools\promote.ps1") -Yes
  if ($LASTEXITCODE -ne 0) { Say "Promotion did not go through (see above). The testing server still starts with what it has." Yellow }
  Step "2. Taking testing into $dir"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir "tools\pull-testing.ps1")
  if ($LASTEXITCODE -ne 0) { Say "The testing folder did not take it (see above). The testing server still starts with what it has." Yellow }
} else {
  Step "Promoting testing to PRODUCTION"
  git fetch -q origin
  $waiting = @(git log --oneline "HEAD..origin/testing")
  if (-not $waiting.Count) { Say "Production already has everything that is on testing." Green }
  else {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir "tools\promote.ps1") -Production -Check
    Say ""
    Say "The floor's server takes these at once. If it says the server will reload, every station shows Resume for a few seconds." Yellow
    $k = Read-Host "Promote to production now? Type Y and press Enter (anything else: no)"
    if ($k -match '^\s*[yY]') {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir "tools\promote.ps1") -Production -Yes
      if ($LASTEXITCODE -ne 0) { Say "Promotion did not go through (see above)." Yellow }
    } else { Say "Not promoted. Production stays as it is." Yellow }
  }
}

# ---- The server ------------------------------------------------------------
Step "The server"
if (Answers) {
  Say "The $Stage server is already running on this PC: it has taken the new files by itself." Green
  Links
  Start-Process "https://localhost:$port/"
  exit 0
}

# Other PCs cannot reach the port until the firewall lets it in.
$open = @(Get-NetFirewallPortFilter -Protocol TCP -ErrorAction SilentlyContinue | Where-Object { @($_.LocalPort) -contains "$port" } |
  Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.Direction -eq "Inbound" -and $_.Enabled -eq "True" -and $_.Action -eq "Allow" })
if (-not $open.Count) {
  Say "Windows Firewall does not let other PCs in on port $port yet (this PC can still use it)." Yellow
  $k = Read-Host "Let other PCs in? Windows asks for admin rights. Type Y and press Enter (anything else: skip)"
  if ($k -match '^\s*[yY]') {
    Start-Process netsh -ArgumentList "advfirewall firewall add rule name=`"Jersey QC $port`" dir=in action=allow protocol=TCP localport=$port profile=domain,private" -Verb RunAs -Wait
  }
}

if ($Stage -eq "production") {
  if (Get-ScheduledTask -TaskName "Jersey QC server" -ErrorAction SilentlyContinue) {
    Say "Starting the 'Jersey QC server' task..."
    Start-ScheduledTask -TaskName "Jersey QC server"
    foreach ($i in 1..15) { Start-Sleep 2; if (Answers) { break } }
    if (Answers) { Say "The production server is running." Green; Links; Start-Process "https://localhost:$port/"; exit 0 }
    Say "The task did not bring it up: starting it in this window instead." Yellow
  }
  Say "KEEP THIS WINDOW OPEN: closing it stops the floor's server." Yellow
  Links
  Start-Process cmd -ArgumentList "/c timeout /t 8 /nobreak >nul & start `"`" https://localhost:$port/" -WindowStyle Hidden
  npm.cmd run dev
  exit $LASTEXITCODE
}

Say "Starting the $Stage server in this window. KEEP THIS WINDOW OPEN: closing it stops the $Stage server." Yellow
Links
Start-Process cmd -ArgumentList "/c timeout /t 8 /nobreak >nul & start `"`" https://localhost:$port/" -WindowStyle Hidden
$env:JQC_STAGE = $Stage
npx.cmd vite --config vite.config.stage.js
exit $LASTEXITCODE
