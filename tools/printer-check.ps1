# Why does the label printer not answer? Run this ON THE SERVER PC (the PC the
# hub prints from) and copy what it says. It checks, step by step and with the
# time each step took, the same path a label takes:
#   1. does the name of the PC that shares the printer resolve, and to what
#   2. do its file-sharing (445) and RPC (135) ports answer
#   3. does the printer open (the step the hub's print script waits on)
#   4. one small test label, sent the way the hub sends every label
#   powershell -ExecutionPolicy Bypass -File tools\printer-check.ps1
#   powershell -ExecutionPolicy Bypass -File tools\printer-check.ps1 -Printer "\\AK-NB-164\Zebra" -NoPrint
# The printer defaults to JERSEY_PRINTER in .env.local, else \\AK-NB-164\Zebra.
param([string]$Printer = "", [switch]$NoPrint)
$ErrorActionPreference = "Continue"
function Say($t) { Write-Host ("[{0}] {1}" -f (Get-Date).ToString("HH:mm:ss"), $t) }

$root = Split-Path -Parent $PSScriptRoot
if (-not $Printer) {
  $envFile = Join-Path $root ".env.local"
  if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^\s*JERSEY_PRINTER\s*=' } | Select-Object -First 1
    if ($line) { $Printer = ($line -replace '^\s*JERSEY_PRINTER\s*=\s*', '').Trim().Trim('"') }
  }
  if (-not $Printer) { $Printer = "\\AK-NB-164\Zebra" }
}
$sharer = if ($Printer -match '^\\\\([^\\]+)\\') { $Matches[1] } else { "" }

Say "Printer check on $env:COMPUTERNAME, signed in as $env:USERDOMAIN\$env:USERNAME"
Say "Printer: $Printer"

if ($sharer) {
  try {
    $addrs = [System.Net.Dns]::GetHostAddresses($sharer) | ForEach-Object { $_.IPAddressToString }
    Say "1. $sharer resolves to: $($addrs -join ', ')"
  } catch { Say "1. $sharer does NOT resolve: $($_.Exception.Message)" }
  foreach ($port in 445, 135) {
    $sw = [Diagnostics.Stopwatch]::StartNew(); $open = $false
    try {
      $c = New-Object Net.Sockets.TcpClient
      $ar = $c.BeginConnect($sharer, $port, $null, $null)
      $open = $ar.AsyncWaitHandle.WaitOne(8000) -and $c.Connected
      $c.Close()
    } catch { }
    Say ("2. port {0} on {1}: {2} ({3:n1} s)" -f $port, $sharer, $(if ($open) { "answers" } else { "NO ANSWER" }), $sw.Elapsed.TotalSeconds)
  }
} else {
  Say "1-2. a printer on this PC itself: no network steps"
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class PrnCheck {
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool OpenPrinter(string name, out IntPtr h, IntPtr def);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  public static int Open(string name) {
    IntPtr h;
    if (!OpenPrinter(name, out h, IntPtr.Zero)) return Marshal.GetLastWin32Error();
    ClosePrinter(h);
    return 0;
  }
}
"@
Say "3. opening the printer (this is where the hub waited 30 s; give it up to 2 minutes)..."
$sw = [Diagnostics.Stopwatch]::StartNew()
$code = [PrnCheck]::Open($Printer)
$secs = $sw.Elapsed.TotalSeconds
if ($code -eq 0) { Say ("3. the printer opened ({0:n1} s)" -f $secs) }
else {
  $why = (New-Object ComponentModel.Win32Exception $code).Message
  Say ("3. the printer did NOT open ({0:n1} s): error {1}, {2}" -f $secs, $code, $why)
}

if ($NoPrint) { Say "4. no test label (-NoPrint)" }
elseif ($code -ne 0) { Say "4. no test label: the printer did not open" }
else {
  $zpl = Join-Path $env:TEMP "jerseyqc-printer-check.zpl"
  "^XA^CI28^PW406^LL203^LH0,0^LT0^FO16,40^A0N,60,60^FB374,1,0,C^FDPRINT TEST^FS^FO16,120^A0N,28,28^FB374,1,0,C^FD$env:COMPUTERNAME  $((Get-Date).ToString('HH:mm:ss'))^FS^PQ1^XZ" | Set-Content -Path $zpl -Encoding ascii
  Say "4. sending one test label the way the hub does..."
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $out = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "print-raw.ps1") -Printer $Printer -File $zpl 2>&1 | Out-String
  Say ("4. {0} ({1:n1} s)" -f ($out.Trim() -replace '\s+', ' '), $sw.Elapsed.TotalSeconds)
  Remove-Item $zpl -ErrorAction SilentlyContinue
}
Say "Done. Copy everything above into the chat."
