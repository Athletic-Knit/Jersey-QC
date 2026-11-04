# Sends a file of raw printer commands (ZPL for the Zebra) straight to a
# Windows printer queue, bypassing the driver's rendering - the way label
# printers are meant to be driven. The hub calls this for the bin labels.
#   powershell -File tools\print-raw.ps1 -List                         printers on this PC, as JSON
#   powershell -File tools\print-raw.ps1 -Printer "ZDesigner ZD411-203dpi ZPL" -File labels.zpl
param([string]$Printer = "", [string]$File = "", [switch]$List)
$ErrorActionPreference = "Stop"
if ($List) {
  $p = @(Get-Printer | Select-Object Name, DriverName, PortName, PrinterStatus)
  if ($p.Count -eq 1) { "[" + ($p[0] | ConvertTo-Json -Compress) + "]" } else { $p | ConvertTo-Json -Compress }
  exit 0
}
if (-not $Printer -or -not $File) { Write-Error "Usage: -Printer <name> -File <path>, or -List"; exit 2 }
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool OpenPrinter(string name, out IntPtr h, IntPtr def);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern int StartDocPrinter(IntPtr h, int level, ref DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, IntPtr buf, int n, out int written);
  public static int Send(string printer, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("OpenPrinter failed (" + Marshal.GetLastWin32Error() + "): is '" + printer + "' the printer's exact name?");
    try {
      DOCINFO di = new DOCINFO(); di.pDocName = "Jersey QC labels"; di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, ref di) == 0) throw new Exception("StartDocPrinter failed (" + Marshal.GetLastWin32Error() + ")");
      StartPagePrinter(h);
      IntPtr p = Marshal.AllocHGlobal(bytes.Length);
      Marshal.Copy(bytes, 0, p, bytes.Length);
      int written; bool ok = WritePrinter(h, p, bytes.Length, out written);
      Marshal.FreeHGlobal(p);
      EndPagePrinter(h); EndDocPrinter(h);
      if (!ok || written != bytes.Length) throw new Exception("WritePrinter wrote " + written + " of " + bytes.Length + " bytes");
      return written;
    } finally { ClosePrinter(h); }
  }
}
"@
$n = [RawPrint]::Send($Printer, [System.IO.File]::ReadAllBytes($File))
"sent $n bytes to $Printer"
