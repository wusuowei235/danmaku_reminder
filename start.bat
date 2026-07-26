@echo off
title Danmaku Reminder Launcher

setlocal enabledelayedexpansion
set "ROOT=%~dp0"

echo ============================================
echo    Danmaku Reminder - Starting up...
echo ============================================
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python 3.11+ from:
    echo         https://www.python.org/downloads/
    echo.
    echo         Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PY_VER=%%i
echo [OK] Python %PY_VER%

:: Install dependencies
echo.
echo [..] Installing/checking dependencies...
python -m pip install -r "%ROOT%requirements.txt" --quiet 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Dependency installation failed.
    echo         Try manually: pip install -r "%ROOT%requirements.txt"
    pause
    exit /b 1
)
echo [OK] All dependencies ready

:: Check WebView2 Runtime (multiple detection methods)
echo.
echo [..] Checking WebView2 Runtime...
set WV2_FOUND=0
reg query "HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" >nul 2>&1 && set WV2_FOUND=1
if %WV2_FOUND%==0 reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" >nul 2>&1 && set WV2_FOUND=1
if %WV2_FOUND%==0 reg query "HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" >nul 2>&1 && set WV2_FOUND=1
if %WV2_FOUND%==0 if exist "%SYSTEMROOT%\System32\WebView2Loader.dll" set WV2_FOUND=1
if %WV2_FOUND%==0 for /f "delims=" %%i in ('dir /s/b "%PROGRAMFILES%\Microsoft Edge\Application\*msedgewebview2.exe" 2^>nul') do set WV2_FOUND=1
if %WV2_FOUND%==0 for /f "delims=" %%i in ('dir /s/b "%PROGRAMFILES(X86)%\Microsoft\Edge\Application\*msedgewebview2.exe" 2^>nul') do set WV2_FOUND=1

if %WV2_FOUND%==0 (
    echo [..] WebView2 not found. Downloading installer...
    curl -sL "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -o "%TEMP%\MicrosoftEdgeWebview2Setup.exe"
    if exist "%TEMP%\MicrosoftEdgeWebview2Setup.exe" (
        start /wait "" "%TEMP%\MicrosoftEdgeWebview2Setup.exe" /silent /install
        echo [OK] WebView2 installed
    ) else (
        echo [WARN] Auto-download failed.
        echo        https://developer.microsoft.com/microsoft-edge/webview2/
    )
) else (
    echo [OK] WebView2 Runtime is ready
)

:: Launch
echo.
echo ============================================
echo    Launching Danmaku Reminder...
echo ============================================
cd /d "%ROOT%"
python "%ROOT%main.py"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Application exited with code: %errorlevel%
    echo.
    echo TIP: Run build.bat to compile a standalone .exe
    echo      that doesn't need Python installed.
    pause
)
