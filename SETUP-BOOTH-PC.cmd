@echo off
rem SETUP-BOOTH-PC.cmd — copy this WHOLE project folder PLUS .env to the other Windows PC.
rem Guests stay on the Vercel website. This PC only runs the silent print worker.
rem Same Wi-Fi as the Canon SELPHY (and the Android tablets). Do not email or commit .env.
rem On the new PC: unzip/copy the folder, put .env in this same folder, double-click this file.
rem Install Node.js LTS from https://nodejs.org if asked. Wait until the worker starts.
rem LEAVE THIS WINDOW OPEN while the booth is printing. Close it only when the event is over.
rem Optional prompt: auto-start at Windows logon so powering on this PC is enough next time.
rem Debug output below: Windows, this PC IPv4, Node, port 8080, SELPHY ARP / IPP 631 hint.
rem If print fails: SELPHY powered on, same Wi-Fi, paper/ribbon loaded, this window still running.

setlocal EnableExtensions
title Smart Start — booth print PC
cd /d "%~dp0"

echo.
echo ============================================
echo  Smart Start — booth print PC setup
echo ============================================
echo  Folder: %CD%
echo.

if not exist "package.json" (
  echo ERROR: package.json not found.
  echo Copy the whole project folder, then double-click SETUP-BOOTH-PC.cmd inside it.
  goto :fail
)

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed on this PC.
  echo.
  echo  1. Open https://nodejs.org
  echo  2. Download the LTS installer and run it.
  echo  3. Close this window, then double-click SETUP-BOOTH-PC.cmd again.
  goto :fail
)

if not exist ".env" (
  echo ERROR: .env is missing in this folder.
  echo.
  echo Copy .env from the original booth PC into:
  echo   %CD%
  echo Do not invent keys. Do not commit .env.
  goto :fail
)

if not exist "node_modules\" (
  echo Installing npm packages ^(first run, may take a few minutes^)...
  echo.
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install failed. Check Node.js LTS is installed, then retry.
    goto :fail
  )
  echo.
)

echo --- Debug ---
echo.
echo Windows:
ver
echo.
echo This PC IPv4:
ipconfig | findstr /i "IPv4"
echo.
echo Node.js:
call node -v
echo npm:
call npm -v
echo.
echo Port 8080:
netstat -ano | findstr /R /C:":8080 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  echo   FREE — print worker can bind here.
) else (
  echo   IN USE — another process is already listening.
  netstat -ano | findstr /R /C:":8080 .*LISTENING"
  echo   If that is an old booth window, close it or continue anyway.
)
echo.
echo SELPHY hint ^(Canon MAC DC-C2-C9 / IPP TCP 631^):
arp -a | findstr /i "dc-c2-c9"
if errorlevel 1 (
  echo   No Canon OUI DC-C2-C9 in ARP yet.
  echo   Power on the SELPHY on this same Wi-Fi, wait 10 seconds, run this file again if needed.
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $c = Get-NetTCPConnection -RemotePort 631 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty RemoteAddress -Unique; if ($c) { Write-Host ('  Active IPP/TCP 631: ' + ($c -join ', ')) } else { Write-Host '  No active TCP 631 connections yet (OK if SELPHY is idle).' } } catch { Write-Host '  Could not query TCP 631.' }"
echo.
echo Tablets stay on Vercel. This window is the Windows print worker only.
echo.

set "AUTOSTART=N"
set /p AUTOSTART="Install auto-start at Windows logon? [Y/N] (default N): "
if /i "%AUTOSTART%"=="Y" (
  echo.
  echo Registering logon auto-start...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\install-booth-autostart.ps1" -SkipStart
  if errorlevel 1 (
    echo Auto-start install failed — you can still print from this window.
  ) else (
    echo Auto-start OK. After a reboot, this PC will start the worker by itself.
  )
  echo.
)

echo ============================================
echo  Starting print worker ^(npm run booth^)
echo  LEAVE THIS WINDOW OPEN
echo ============================================
echo.
call npm run booth
echo.
echo Print worker stopped.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
