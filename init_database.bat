@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [ОШИБКА] Не найдено виртуальное окружение .venv.
  echo Выполните установку зависимостей из requirements.txt.
  exit /b 1
)

echo Инициализация схемы Supabase и bootstrap-администратора...
".venv\Scripts\python.exe" init_database.py
if errorlevel 1 (
  echo.
  echo Проверьте SUPABASE_DB_URL в файле .env.
  exit /b 1
)

endlocal
