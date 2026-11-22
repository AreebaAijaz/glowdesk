@echo off
title Glowdesk
cd /d "%~dp0"
echo.
echo  ==== Glowdesk ====
echo.
if exist glowdesk-app.zip (
  echo  Unpacking the app files...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Force -Path 'glowdesk-app.zip' -DestinationPath '.'"
  del glowdesk-app.zip
)
if not exist node_modules (
  echo  Installing packages - this takes a few minutes the first time...
  call npm install
)
echo.
echo  Starting Glowdesk at http://localhost:3000
echo  Keep this window open while you use the app.
echo.
call npm run dev
pause
