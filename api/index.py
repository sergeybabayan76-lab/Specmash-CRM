import sys
import os

# Добавляем корневую директорию проекта в sys.path, чтобы python видел server.py и database.py
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

try:
    from server import app
except Exception as e:
    # Если произойдет ошибка при импорте server, создадим аварийное FastAPI приложение, 
    # чтобы Vercel вывел точный текст ошибки вместо бесследного сбоя 500
    from fastapi import FastAPI
    app = FastAPI()
    
    @app.get("/{full_path:path}")
    def catch_all(full_path: str):
       
