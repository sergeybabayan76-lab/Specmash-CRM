import sys
import os

# Добавляем корень проекта в путь
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Импортируем готовый app из server.py, чтобы Vercel его сразу увидел
from server import app
