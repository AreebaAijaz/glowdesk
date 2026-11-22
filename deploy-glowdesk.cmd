@echo off
title Glowdesk - put online
cd /d D:\GlowDesk
echo.
echo ===== Step 1 of 3: sign in to Vercel =====
echo A browser page will open. Sign in to Vercel there and confirm.
echo.
call npx --yes vercel@latest login
echo.
echo ===== Step 2 of 3: checking the app builds (2-4 minutes) =====
call npm run build > deploy-log.txt 2>&1
if errorlevel 1 (
  echo BUILD FAILED. Tell Claude "build failed" - Claude can read deploy-log.txt.
  pause
  exit /b 1
)
echo Build OK.
echo.
echo ===== Step 3 of 3: uploading to Vercel (2-4 minutes) =====
call npx --yes vercel@latest deploy --prod --yes >> deploy-log.txt 2>&1
if errorlevel 1 (
  echo UPLOAD FAILED. Tell Claude "upload failed" - Claude can read deploy-log.txt.
  pause
  exit /b 1
)
echo.
echo DONE. Tell Claude "deployed". The web address is in deploy-log.txt.
echo.
pause
