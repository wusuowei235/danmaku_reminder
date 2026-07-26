@echo off
title Danmaku Reminder - Build

setlocal enabledelayedexpansion
set "ROOT=%~dp0"

echo ============================================
echo    Building Danmaku Reminder EXE
echo ============================================
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found.
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PY_VER=%%i
echo [OK] Python %PY_VER%

:: Install dependencies
echo.
echo [..] Installing dependencies...
python -m pip install -r "%ROOT%requirements.txt" --quiet 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Install failed.
    pause
    exit /b 1
)

:: Install pyinstaller
echo [..] Installing PyInstaller...
python -m pip install pyinstaller --quiet 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] PyInstaller install failed.
    pause
    exit /b 1
)

:: Clean previous build
if exist "%ROOT%dist" rmdir /s /q "%ROOT%dist"
if exist "%ROOT%build" rmdir /s /q "%ROOT%build"

:: Build
echo.
echo [..] Building EXE (this may take a few minutes)...
cd /d "%ROOT%"
pyinstaller --clean --noconfirm ^
    --name "DanmakuReminder" ^
    --onefile ^
    --windowed ^
    --add-data "web\danmaku;web\danmaku" ^
    --add-data "web\settings;web\settings" ^
    --hidden-import "win32api" ^
    --hidden-import "win32gui" ^
    --hidden-import "win32con" ^
    --hidden-import "PIL._tkinter_finder" ^
    main.py

if %errorlevel% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo    BUILD SUCCESSFUL!
echo ============================================
echo.
echo Output: %ROOT%dist\DanmakuReminder.exe
echo.
echo You can now distribute "dist\DanmakuReminder.exe"
echo as a single file - no Python required.
echo.
pause
