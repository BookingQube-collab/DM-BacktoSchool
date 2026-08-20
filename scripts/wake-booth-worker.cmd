@echo off
rem ASCII only. Vite "ready" does not load src/server.ts until a request hits.
rem Ping localhost so startPrintWorker actually runs.
timeout /t 8 /nobreak >nul
for /L %%i in (1,1,15) do (
  curl.exe -s -o nul --connect-timeout 2 http://127.0.0.1:8080/ >nul 2>&1
  curl.exe -s -o nul --connect-timeout 2 http://127.0.0.1:8080/api/print >nul 2>&1
  timeout /t 2 /nobreak >nul
)
