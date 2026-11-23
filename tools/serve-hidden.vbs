' Runs the Jersey QC server with no window, for the "Jersey QC server" scheduled
' task that starts it at log-on (see tools\install-autostart.ps1). Output goes
' to data\server.log. This script stays alive while the server runs, so Task
' Scheduler sees the task as running, refuses to start a second copy, and
' restarts it if the server ever exits.
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = root
If Not fso.FolderExists(root & "\data") Then fso.CreateFolder(root & "\data")
' The last run's log is kept as data\server-previous.log (replacing an older
' one): a restart used to write over it, and the crash that caused the restart
' was lost with it (code review, 23 Nov 2026). If it cannot be moved (still
' held open), the server starts all the same.
On Error Resume Next
If fso.FileExists(root & "\data\server.log") Then
  If fso.FileExists(root & "\data\server-previous.log") Then fso.DeleteFile root & "\data\server-previous.log", True
  fso.MoveFile root & "\data\server.log", root & "\data\server-previous.log"
End If
Err.Clear
On Error GoTo 0
code = sh.Run("cmd /c npm.cmd run dev > ""data\server.log"" 2>&1", 0, True)
WScript.Quit code
