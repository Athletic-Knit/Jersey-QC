# Throws away every label waiting in the label printer's queue on THIS PC, and
# says how many it cleared and how many are left (should be 0).
# For testing with the Zebra unplugged: the stickers and tickets the app sends
# pile up in the Windows queue and would all print the moment the printer is
# plugged back in. Run it on the PC the Zebra plugs into (the queue lives there).
#   clear-prints                                              (from the project folder)
#   powershell -ExecutionPolicy Bypass -File tools\clear-print-queue.ps1
#   powershell -ExecutionPolicy Bypass -File tools\clear-print-queue.ps1 -Printer "ZDesigner ZD411-203dpi ZPL"
# Without -Printer it clears every queue whose name or driver says Zebra.
param([string]$Printer = "")
$ErrorActionPreference = "Stop"

$queues = @(Get-Printer | Where-Object { if ($Printer) { $_.Name -eq $Printer } else { "$($_.Name) $($_.DriverName)" -match 'zebra|zd4|zdesigner' } })
if (-not $queues.Count) {
  Write-Host "No label printer queue found on $env:COMPUTERNAME$(if ($Printer) { " named '$Printer'" }). Nothing cleared."
  exit 1
}
$waiting = { @($queues | ForEach-Object { Get-PrintJob -PrinterName $_.Name -ErrorAction SilentlyContinue }) }

$before = & $waiting
$failed = 0
foreach ($job in $before) {
  try { Remove-PrintJob -PrinterName $job.PrinterName -ID $job.Id -ErrorAction Stop } catch { $failed++ }
}
# A job that was already on its way to the printer can take a moment to go.
$left = & $waiting
for ($i = 0; $i -lt 10 -and $left.Count -gt 0; $i++) { Start-Sleep -Milliseconds 500; $left = & $waiting }

$cleared = $before.Count - $left.Count
Write-Host "Queue: $(($queues | ForEach-Object { $_.Name }) -join ', ') on $env:COMPUTERNAME"
Write-Host "Cleared: $cleared"
Write-Host "Left:    $($left.Count)"
if ($left.Count -gt 0) {
  Write-Host ""
  Write-Host "Still in the queue:"
  $left | ForEach-Object { Write-Host ("  job {0}  {1}  {2}" -f $_.Id, $_.JobStatus, $_.DocumentName) }
  Write-Host "A job stuck on 'Deleting' goes when the printer is plugged in, or when the Print Spooler service is restarted (needs an administrator)."
  exit 2
}
