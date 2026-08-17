$ErrorActionPreference = "Stop"
$taskName = "SmartStartBoothPrint"

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Removed scheduled task $taskName."
} else {
  Write-Host "No scheduled task named $taskName."
}
