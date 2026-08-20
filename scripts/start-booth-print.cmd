@echo off
setlocal
title Smart Start booth print
cd /d "%~dp0\.."

if not exist "node_modules\" (
  echo Installing npm packages...
  call npm install
  if errorlevel 1 (
    echo npm install failed. Check Node.js is installed.
    pause
    exit /b 1
  )
)

if not exist "logs\" mkdir logs

:loop
echo [%date% %time%] Starting booth print worker on port 8080...
echo Look for: [print-worker] polling print_jobs
start "booth-wake" /b cmd /c ""%~dp0wake-booth-worker.cmd""
call npm run booth
echo [%date% %time%] Worker stopped. Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop
