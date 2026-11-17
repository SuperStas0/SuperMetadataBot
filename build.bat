@echo off
setlocal enabledelayedexpansion
set "doClean="
set "doSetup="
set "doRelease="
set "doHelp="

:args
if "%~1"=="" goto run
set "arg=%~1"
if not "!arg:~0,1!"=="-" goto invalid
if "!arg!"=="-" goto invalid
set "chars=!arg:~1!"
:chars
if "!chars!"=="" (
    shift
    goto args
)
set "ch=!chars:~0,1!"
set "chars=!chars:~1!"
if "!ch!"=="c" (
    set "doClean=1"
    goto chars
)
if "!ch!"=="s" (
    set "doSetup=1"
    goto chars
)
if "!ch!"=="r" (
    set "doRelease=1"
    goto chars
)
if "!ch!"=="h" (
    set "doHelp=1"
    goto chars
)
goto invalid

:invalid
echo Unknown flag: !arg!. Use -h for help.
exit /b 1

:run
if defined doHelp goto help
cd /d "%~dp0"
if defined doClean (
    if exist node_modules rmdir /s /q node_modules
)
call :checkNode
if errorlevel 1 call :installNode
call :checkNode
if errorlevel 1 (
    echo Error: Node.js 22 or newer is required and could not be installed. Install it from https://nodejs.org and run build.bat again.
    exit /b 1
)
call npm install
if errorlevel 1 exit /b 1
if not defined doSetup if not defined doRelease if not exist static\config.json set "doSetup=1"
if not defined doSetup if not defined doRelease echo Found static\config.json, skipping setup. Run build.bat -s to set it up again.
if defined doSetup (
    node start.js -s
    if errorlevel 1 exit /b 1
)
if defined doRelease (
    if not exist release mkdir release
    if exist release\Metadata.zip del release\Metadata.zip
    tar -a -c -f release\Metadata.zip --exclude config.json --exclude config.json.bak --exclude settings.json --exclude cookies.txt main.js start.js build.bat build.sh src static package.json package-lock.json readme.md LICENSE.md
    if errorlevel 1 exit /b 1
)
exit /b 0

:help
echo Usage: build.bat [-c] [-s] [-r] [-h]
echo   -c  clean: delete previous build output first
echo   -s  setup: ask for the bot token and Telegram account, save static\config.json
echo   -r  release: package the build into release\
echo   -h  show this help
echo Node.js 22 or newer is installed automatically if missing.
echo Setup also runs when static\config.json is missing, unless -r is given.
echo Build output: %~dp0node_modules
echo Release:      %~dp0release
exit /b 0

:checkNode
where node >nul 2>nul
if errorlevel 1 exit /b 1
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
exit /b %errorlevel%

:installNode
echo Installing Node.js, confirm the administrator prompt if it appears
where winget >nul 2>nul
if errorlevel 1 goto installMsi
winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
set "PATH=%ProgramFiles%\nodejs;%PATH%"
call :checkNode
if not errorlevel 1 exit /b 0

:installMsi
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $v=(Invoke-RestMethod https://nodejs.org/dist/index.json | Where-Object lts | Select-Object -First 1).version; $a='x64'; if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $a='arm64' }; $f=Join-Path $env:TEMP 'node-install.msi'; Invoke-WebRequest ('https://nodejs.org/dist/'+$v+'/node-'+$v+'-'+$a+'.msi') -OutFile $f; Start-Process msiexec -ArgumentList '/i',$f,'/passive','/norestart' -Wait -Verb RunAs; Remove-Item $f"
set "PATH=%ProgramFiles%\nodejs;%PATH%"
exit /b 0
