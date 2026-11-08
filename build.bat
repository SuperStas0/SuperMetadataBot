@echo off
setlocal enabledelayedexpansion
set "doClean="
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
where npm >nul 2>nul
if errorlevel 1 (
    echo Error: npm not found, install Node.js.
    exit /b 1
)
if defined doClean (
    if exist node_modules rmdir /s /q node_modules
)
call npm install
if errorlevel 1 exit /b 1
if defined doRelease (
    if not exist release mkdir release
    if exist release\Metadata.zip del release\Metadata.zip
    tar -a -c -f release\Metadata.zip --exclude config.json main.js src static package.json package-lock.json readme.md LICENSE.md
    if errorlevel 1 exit /b 1
)
exit /b 0

:help
echo Usage: build.bat [-c] [-r] [-h]
echo   -c  clean: delete previous build output first
echo   -r  release: package the build into release\
echo   -h  show this help
echo Build output: %~dp0node_modules
echo Release:      %~dp0release
exit /b 0
