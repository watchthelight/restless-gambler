@echo off
setlocal enabledelayedexpansion

set "RG_VERBOSE=false"
set "RG_PRODUCTION=false"
set "RG_DEVONLY=false"

:parse_args
if "%~1"=="" goto end_parse
if "%~1"=="-v" (
    set "RG_VERBOSE=true"
    shift
    goto parse_args
)
if "%~1"=="-production" (
    set "RG_PRODUCTION=true"
    shift
    goto parse_args
)
if "%~1"=="-devonly" (
    set "RG_DEVONLY=true"
    REM Allow override if already set; otherwise set both default role IDs
    if not defined RG_DEVONLY_ROLES (
        set "RG_DEVONLY_ROLES=1425816468041236521,1425853114514411582"
    )
    shift
    goto parse_args
)
if "%~1"=="-reset" (
    echo Resetting configuration...
    REM Add reset logic if needed
    shift
    goto parse_args
)
shift
goto parse_args

:end_parse

echo Starting Restless Gambler Bot (CLI Mode)
echo Flags: Verbose=%RG_VERBOSE%, Production=%RG_PRODUCTION%, DevOnly=%RG_DEVONLY%

powershell -ExecutionPolicy Bypass -File "%~dp0Start.ps1" -Mode CLI
