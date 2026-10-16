@echo off
chcp 65001 >nul
title СТО Спецмаш CRM — Supabase PostgreSQL

echo ========================================================
echo   Запуск СТО Спецмаш CRM (FastAPI + Supabase PostgreSQL)
echo ========================================================
echo.

cd /d "%~dp0"
if not exist ".env" (
    echo [ПРЕДУПРЕЖДЕНИЕ] Файл .env не найден. Создайте его из .env.example
    echo и заполните параметры Supabase и APP_SESSION_SECRET перед входом.
    echo.
)

:: Ensure Python is on PATH even if terminal wasn't refreshed
set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%PATH%"

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ОШИБКА] Python не обнаружен в системе.
    echo Пожалуйста, установите Python 3.12 или запустите:
    echo winget install Python.Python.3.12
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo Создание виртуального окружения...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ОШИБКА] Не удалось создать виртуальное окружение.
        pause
        exit /b 1
    )
)

echo [1/2] Проверка зависимостей...
".venv\Scripts\python.exe" -m pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [ОШИБКА] Не удалось установить зависимости из requirements.txt.
    pause
    exit /b 1
)

echo [2/2] Запуск локального сервера...
echo.
echo Открытие приложения в браузере: http://localhost:8000
echo Для остановки сервера нажмите Ctrl + C в этом окне.
echo.

start "" "http://localhost:8000"
".venv\Scripts\python.exe" -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
pause
