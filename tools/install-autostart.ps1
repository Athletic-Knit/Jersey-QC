# Registers a scheduled task that starts the Jersey QC server, hidden, whenever
# this user logs on to this PC, and restarts it if it ever stops. Run once on
# the host PC (no admin needed):
#   powershell -ExecutionPolicy Bypass -File tools\install-autostart.ps1
# Afterwards:  schtasks /run /tn "Jersey QC server"     starts it now
#              schtasks /end /tn "Jersey QC server"     stops it
#              schtasks /delete /tn "Jersey QC server"  removes the auto-start
# The server keeps its state in data\hub.json across restarts; nothing is lost.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$name = "Jersey QC server"
$action   = New-ScheduledTaskAction -Execute "wscript.exe" -Argument ('"' + (Join-Path $root "tools\serve-hidden.vbs") + '"') -WorkingDirectory $root
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description "Jersey QC Scanner dev server, hidden, from $root" -Force | Out-Null
Write-Host "Registered '$name': starts at log-on for $env:USERNAME from $root"
