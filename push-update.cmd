@echo off
title Glowdesk - publish update
cd /d D:\GlowDesk
echo Publishing the latest changes to GitHub. Vercel will update the live site in about 1 minute.
git add -A
git commit -m "Small-phone layout polish"
git push
echo.
if errorlevel 1 (echo PUSH FAILED - tell Claude.) else (echo DONE - tell Claude "pushed".)
pause
