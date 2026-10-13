@echo off
chcp 65001 >nul
title СТО Спецмаш CRM — Сервер

echo ========================================================
echo        Запуск СТО Спецмаш CRM (FastAPI + SQLite)
echo ========================================================
echo.

cd /d "%~dp0"

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

echo [1/2] Проверка зависимостей...
python -m pip install -r requirements.txt --quiet

echo [2/2] Запуск локального сервера...
echo.
echo Открытие приложения в браузере: http://localhost:8000
echo Для остановки сервера нажмите Ctrl + C в этом окне.
echo.

start "" "http://localhost:8000"
python -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
pause
