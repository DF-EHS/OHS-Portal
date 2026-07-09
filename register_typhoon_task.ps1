# OHS Typhoon Auto-Dispatch - Task Scheduler Registration
# Run as regular user (NOT admin)

$taskName   = "OHS-TyphoonDispatch"
$pythonExe  = "C:\Python314\python.exe"
$scriptPath = "C:\Users\gloom.lai\OHS-Portal\typhoon_dispatch.py"

schtasks /Delete /TN $taskName /F 2>&1 | Out-Null

$tr = "`"$pythonExe`" `"$scriptPath`""
schtasks /Create /TN $taskName /TR $tr /SC DAILY /ST 06:00 /RI 30 /DU 16:00 /IT /F

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Task created as current user: $env:USERNAME"
} else {
    Write-Host "[ERROR] Failed to create task"
}
