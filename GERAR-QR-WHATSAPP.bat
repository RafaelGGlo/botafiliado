@echo off
setlocal
title Conectar WhatsApp - QR Code
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node.js 24 ou superior.
  pause
  exit /b 1
)
node "scripts\conectar-whatsapp.mjs" --evolution
set "result=%errorlevel%"
echo.
echo Este gerador conecta somente a Evolution. Nao inicia os envios do bot.
echo Para o fluxo antigo, use: node scripts\conectar-whatsapp.mjs --new-session
pause
exit /b %result%
