# Wraps "Start Station (kiosk).bat" into one exe with IExpress, which ships
# with Windows, so a station PC gets a single file to double-click. The exe
# unpacks the launcher to a temp folder and runs it; the launcher itself
# asks for the server address and station once (kept in %APPDATA%\JerseyQC).
#   powershell -ExecutionPolicy Bypass -File tools\build-station-exe.ps1 [-Out "C:\...\Jersey QC Station.exe"]
param([string]$Out = "")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $Out) { $Out = Join-Path $root "Jersey QC Station.exe" }
# IExpress fails (exit 1) on paths with spaces, so it builds in a plain temp
# folder and the exe is copied to $Out afterwards.
$work = Join-Path $env:TEMP ("jerseyqc-exe-" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $work | Out-Null
$built = Join-Path $work "JerseyQCStation.exe"
# IExpress is happier without spaces or brackets in the packed file's name.
Copy-Item (Join-Path $root "Start Station (kiosk).bat") (Join-Path $work "station-kiosk.bat")
$sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles
[Strings]
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$built
FriendlyName=Jersey QC Station
AppLaunched=cmd /c call .\station-kiosk.bat
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
FILE0="station-kiosk.bat"
[SourceFiles]
SourceFiles0=$work\
[SourceFiles0]
%FILE0%=
"@
$sedPath = Join-Path $work "station.sed"
# IExpress reads the SED as ANSI.
[System.IO.File]::WriteAllText($sedPath, $sed, [System.Text.Encoding]::Default)
$p = Start-Process -FilePath "$env:WINDIR\System32\iexpress.exe" -ArgumentList @("/N", "/Q", $sedPath) -Wait -PassThru
if (-not (Test-Path $built)) { throw "IExpress did not produce $built (exit $($p.ExitCode))" }
Copy-Item $built $Out -Force
Remove-Item $work -Recurse -Force
Write-Host "Built $Out ($([math]::Round((Get-Item $Out).Length / 1KB)) KB)"
