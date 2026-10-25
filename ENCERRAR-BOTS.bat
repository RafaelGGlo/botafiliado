@echo off
setlocal
title Encerrar bots WhatsApp e Instagram
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado.
  pause
  exit /b 1
)
node "scripts\encerrar-bots.mjs"
if errorlevel 1 (
  echo.
  echo Encerramento nao confirmado. Confira a mensagem acima.
  pause
  exit /b 1
)
pause
endlocal
