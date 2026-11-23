# Shared by stage.ps1, promote.ps1 and pull-testing.ps1 (dot-sourced): each
# stage's own packages, and a copy of its data before anything changes (code
# review of 23 Nov 2026, M21).
#
# Packages. Development and testing used to LINK production's node_modules
# (a junction), so an npm install on either changed the packages under the
# floor's running server, and a promotion that changed package.json never
# installed anything. Now every stage folder has its own node_modules, made by
# `npm ci` from its own package-lock.json. A stamp in node_modules
# (.jqc-lock-sha256) says which lock file it was made from; when the lock file
# changes, the packages are made again.

$script:StampName = ".jqc-lock-sha256"

# A link to another folder (a junction, or a symbolic link). Not any reparse point:
# a folder kept by OneDrive (files on demand) is one too, and is a real folder.
function Test-Junction([string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  return [bool]($item -and ($item.LinkType -eq "Junction" -or $item.LinkType -eq "SymbolicLink"))
}

function Get-LockHash([string]$Dir) {
  $lock = Join-Path $Dir "package-lock.json"
  if (-not (Test-Path -LiteralPath $lock)) { return "" }
  return (Get-FileHash -LiteralPath $lock -Algorithm SHA256).Hash
}

# Why this folder's packages must be made, or "" when they are fine:
#   "linked"   node_modules is a link to another folder's packages
#   "missing"  there is none
#   "changed"  package-lock.json changed since they were made
# A real node_modules with no stamp (made before the stamp existed) is taken as
# matching its lock file: the stamp is written and nothing is installed.
function Get-PackagesNeed([string]$Dir) {
  $nm = Join-Path $Dir "node_modules"
  if (Test-Junction $nm) { return "linked" }
  if (-not (Test-Path -LiteralPath $nm)) { return "missing" }
  $hash = Get-LockHash $Dir
  if (-not $hash) { return "" }
  $stamp = Join-Path $nm $script:StampName
  if (-not (Test-Path -LiteralPath $stamp)) { Set-Content -LiteralPath $stamp -Value $hash -Encoding ascii; return "" }
  if ((Get-Content -LiteralPath $stamp -Raw).Trim() -ne $hash) { return "changed" }
  return ""
}

# Makes this folder's own packages: a link is removed first (the link only:
# `rmdir` without /s never touches the folder it points to), then `npm ci`.
# Returns $true when they were made.
function Install-Packages([string]$Dir) {
  $nm = Join-Path $Dir "node_modules"
  if (Test-Junction $nm) {
    cmd /c rmdir "$nm" | Out-Null
    if (Test-Path -LiteralPath $nm) { Write-Host "Could not remove the link $nm." -ForegroundColor Red; return $false }
    Write-Host "The link to another folder's packages is removed; this folder gets its own." -ForegroundColor Yellow
  }
  Write-Host "Installing the packages (npm ci, a minute or two)..." -ForegroundColor Cyan
  Push-Location -LiteralPath $Dir
  # npm's own words go to the screen, never into what this function returns (a failed
  # install must not come back looking like success).
  try { & npm.cmd ci --no-audit --no-fund | Out-Host; $ok = ($LASTEXITCODE -eq 0) } finally { Pop-Location }
  if ($ok) {
    New-Item -ItemType Directory -Force -Path $nm | Out-Null   # a project with no packages gets no node_modules from npm
    Set-Content -LiteralPath (Join-Path $nm $script:StampName) -Value (Get-LockHash $Dir) -Encoding ascii
  }
  return $ok
}

# Stops whatever listens on this port (the stage's server) and waits until it has gone.
function Stop-PortServer([int]$Port) {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  foreach ($i in 1..15) {
    if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { return $true }
    Start-Sleep 1
  }
  return $false
}

# A copy of the stage's data before it changes: the data files (data\hub*.json)
# AND the unfinished orders kept whole on disk (data\hub*-orders\), which a copy
# of hub.json alone missed. Into data\backups\<date_time>\. Returns that folder,
# or "" when there was nothing to copy.
function Backup-Data([string]$Root) {
  $data = Join-Path $Root "data"
  if (-not (Test-Path -LiteralPath $data)) { return "" }
  $files = @(Get-ChildItem -LiteralPath $data -File -Filter "hub*.json" -ErrorAction SilentlyContinue)
  $dirs  = @(Get-ChildItem -LiteralPath $data -Directory -Filter "hub*-orders" -ErrorAction SilentlyContinue)
  if (-not ($files.Count + $dirs.Count)) { return "" }
  $to = Join-Path $data ("backups\" + (Get-Date -Format "yyyy-MM-dd_HHmmss"))
  New-Item -ItemType Directory -Force -Path $to | Out-Null
  $files | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $to }
  $dirs  | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $to -Recurse }
  # The newest 20 copies are kept; older ones go (a copy is a few MB).
  Get-ChildItem -LiteralPath (Join-Path $data "backups") -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{6}$' } | Sort-Object Name -Descending |
    Select-Object -Skip 20 | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
  return $to
}
