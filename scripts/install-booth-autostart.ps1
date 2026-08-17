# Run once on the Windows PC that STAYS at the booth (not your laptop).
# After this, powering on that PC starts the print worker automatically.
$ErrorActionPreference = "Stop"

$taskName = "SmartStartBoothPrint"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$starter = Join-Path $PSScriptRoot "start-booth-print.cmd"

if (-not (Test-Path $starter)) {
  throw "Missing $starter"
}

$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) {
  Write-Warning "No .env in $root — copy the booth .env onto this PC before event day."
}

$action = New-ScheduledTaskAction -Execute $starter -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew
$settings.DisallowStartIfOnBatteries = $false
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Smart Start Future Me — polls the print queue and sends photos to the SELPHY." `
  -Force | Out-Null

$running = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "Port 8080 is already in use — leaving the current worker running."
} else {
  Start-ScheduledTask -TaskName $taskName
  Write-Host "Started the booth print worker now."
}

Write-Host ""
Write-Host "Installed. On event day you only need this Windows PC powered on,"
Write-Host "same Wi-Fi as the SELPHY. Tablets stay on the Vercel HTTPS site."
Write-Host "You do not need Cursor or your laptop."
Write-Host ""
Write-Host "Remove later with: npm run booth:uninstall"
