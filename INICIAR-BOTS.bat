@echo off
setlocal
title Bots WhatsApp e Instagram
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node.js 24 e tente novamente.
  pause
  exit /b 1
)
node "scripts\iniciar-bots.mjs"
if errorlevel 1 (
  echo.
  echo Nao foi possivel iniciar. Confira a mensagem acima.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:3210/#instagram"
echo.
echo Os bots continuam em segundo plano ao fechar esta janela.
echo Mantenha o computador ligado e conectado a internet.
pause
endlocal
