@echo off
setlocal
cd /d "%~dp0"
set "DOCKER_EXE=docker"
where docker >nul 2>nul
if errorlevel 1 (
  if exist "%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe" (
    set "DOCKER_EXE=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe"
  ) else if exist "%ProgramFiles%\Docker\Docker\resources\bin\docker.exe" (
    set "DOCKER_EXE=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
  ) else (
    echo Docker nao instalado. Conclua a instalacao do Docker Desktop.
    pause
    exit /b 1
  )
)
"%DOCKER_EXE%" info >nul 2>nul
if errorlevel 1 (
  echo Abra o Docker Desktop e aguarde o mecanismo iniciar.
  echo Se voce acabou de instalar o WSL, reinicie o Windows primeiro.
  pause
  exit /b 1
)
"%DOCKER_EXE%" compose --env-file infra/evolution/.env -f infra/evolution/compose.yaml up -d
if errorlevel 1 (
  echo Nao foi possivel iniciar a Evolution. Confira a mensagem acima.
  pause
  exit /b 1
)
"%DOCKER_EXE%" compose --env-file infra/evolution/.env -f infra/evolution/compose.yaml ps
echo Evolution: http://localhost:8080
echo Este iniciador nao altera nem inicia os envios do bot.
pause
