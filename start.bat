@echo off
setlocal
cd /d "%~dp0"
title TrendFrame

where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "process.exit(Number(process.versions.node.split('.')[0])<22?1:0)"
if errorlevel 1 goto oldnode

if not exist node_modules (
  echo Installing dependencies, this takes a minute...
  call npm install
  if errorlevel 1 goto fail
)
if not exist .env (
  if exist .env.example (copy .env.example .env >nul) else (type nul > .env)
  echo Created .env. Add your API keys in Settings after the app opens.
)
if /i "%~1"=="rebuild" if exist dist rmdir /s /q dist
if not exist dist\index.html (
  echo Building the app...
  call npm run build
  if errorlevel 1 goto fail
)

echo Starting TrendFrame. Keep this window open. Close it to stop the app.
call npm start
echo.
echo TrendFrame stopped.
pause
exit /b 0

:nonode
echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this file again.
pause
exit /b 1

:oldnode
echo Node.js 22 or newer is required. Update it from https://nodejs.org and run this file again.
pause
exit /b 1

:fail
echo Something went wrong. See the messages above.
pause
exit /b 1