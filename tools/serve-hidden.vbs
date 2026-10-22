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
code = sh.Run("cmd /c npm.cmd run dev > ""data\server.log"" 2>&1", 0, True)
WScript.Quit code
