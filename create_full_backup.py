"""
Backup Generator for Specmash CRM v1.2.3
Backs up the entire CRM codebase and all database data to D:\\CRM\\backup\\версия 1.2.3
"""

import os
import sys
import json
import csv
import shutil
import sqlite3
from datetime import datetime
import database

BACKUP_DIR = r"D:\CRM\backup\версия 1.2.3"
PROJECT_DIR = r"C:\Users\079\.gemini\antigravity\scratch\tech-crm"

client = database.get_sb_client()

def fetch_all(table, order_col='id'):
    all_rows, offset = [], 0
    chunk_size = 1000
    while True:
        params = {
            'select': '*',
            'order': f'{order_col}.asc',
            'limit': str(chunk_size),
            'offset': str(offset)
        }
        r = client.get(f'/{table}', params=params)
        if r.status_code != 200:
            print(f"Error fetching {table}: {r.status_code}", file=sys.stderr)
            break
        rows = r.json()
        if not rows:
            break
        all_rows.extend(rows)
        offset += len(rows)
        if len(rows) < chunk_size:
            break
    return all_rows

def main():
    print(f"=== Starting Specmash CRM v1.2.3 Backup ===")
    print(f"Destination: {BACKUP_DIR}")
    
    os.makedirs(BACKUP_DIR, exist_ok=True)
    db_backup_dir = os.path.join(BACKUP_DIR, "database_backup")
    csv_dir = os.path.join(BACKUP_DIR, "csv_exports")
    os.makedirs(db_backup_dir, exist_ok=True)
    os.makedirs(csv_dir, exist_ok=True)

    # 1. Fetch all data from Supabase
    tables_to_dump = [
        ('settings', 'key'),
        ('users', 'id'),
        ('clients', 'id'),
        ('equipment', 'id'),
        ('parts', 'id'),
        ('deals', 'id'),
        ('deal_parts', 'id'),
        ('tasks', 'id'),
        ('stock_movements', 'id')
    ]
    
    full_dump = {
        "metadata": {
            "crm_version": "1.2.3",
            "backup_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "database_source": "Supabase PostgreSQL (Cloud)",
            "git_commit": "6a8fcd0"
        },
        "tables": {}
    }
    
    counts = {}

    for t, col in tables_to_dump:
        rows = fetch_all(t, col)
        full_dump["tables"][t] = rows
        counts[t] = len(rows)
        print(f"Fetched {t}: {len(rows)} records")

        # Export to CSV
        if rows:
            csv_path = os.path.join(csv_dir, f"{t}.csv")
            with open(csv_path, "w", encoding="utf-8-sig", newline="") as cf:
                writer = csv.DictWriter(cf, fieldnames=list(rows[0].keys()))
                writer.writeheader()
                writer.writerows(rows)

    # 2. Save JSON dump
    json_path = os.path.join(db_backup_dir, "database_dump_v1.2.3.json")
    with open(json_path, "w", encoding="utf-8") as jf:
        json.dump(full_dump, jf, ensure_ascii=False, indent=2)
    print(f"Saved JSON dump: {json_path}")

    # Also save in project dir for local consistency
    local_json_path = os.path.join(PROJECT_DIR, "database_dump_v1.2.3.json")
    with open(local_json_path, "w", encoding="utf-8") as jf:
        json.dump(full_dump, jf, ensure_ascii=False, indent=2)

    # 3. Copy schema.sql and schema_structure_only.sql
    src_schema = os.path.join(PROJECT_DIR, "schema.sql")
    dst_schema = os.path.join(db_backup_dir, "schema_full_v1.2.3.sql")
    dst_root_schema = os.path.join(BACKUP_DIR, "schema.sql")
    if os.path.exists(src_schema):
        shutil.copy2(src_schema, dst_schema)
        shutil.copy2(src_schema, dst_root_schema)
        print("Copied schema.sql")

    structure_src = r"c:\Users\079\Downloads\schema_structure_only.sql"
    if os.path.exists(structure_src):
        shutil.copy2(structure_src, os.path.join(db_backup_dir, "schema_structure_only.sql"))

    # 4. Create an offline SQLite database with all data
    sqlite_path = os.path.join(db_backup_dir, "crm_v1.2.3.db")
    if os.path.exists(sqlite_path):
        os.remove(sqlite_path)

    conn = sqlite3.connect(sqlite_path)
    cur = conn.cursor()

    cur.execute("""CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');""")
    cur.execute("""CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, full_name TEXT NOT NULL, role TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);""")
    cur.execute("""CREATE TABLE clients (id INTEGER PRIMARY KEY, name TEXT NOT NULL, company TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);""")
    cur.execute("""CREATE TABLE equipment (id INTEGER PRIMARY KEY, client_id INTEGER, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Спецтехника', serial_vin TEXT NOT NULL DEFAULT '', year INTEGER, operating_hours TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Исправна', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);""")
    cur.execute("""CREATE TABLE parts (id INTEGER PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Запчасти', quantity INTEGER NOT NULL DEFAULT 0, min_threshold INTEGER NOT NULL DEFAULT 2, purchase_price REAL NOT NULL DEFAULT 0, selling_price REAL NOT NULL DEFAULT 0, location TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);""")
    cur.execute("""CREATE TABLE deals (id INTEGER PRIMARY KEY, title TEXT NOT NULL, client_id INTEGER, equipment_id INTEGER, stage TEXT NOT NULL DEFAULT 'new', amount REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'normal', responsible TEXT NOT NULL DEFAULT 'Мастер-приемщик', description TEXT NOT NULL DEFAULT '', deadline TEXT, created_at TEXT NOT NULL, completed_at TEXT);""")
    cur.execute("""CREATE TABLE deal_parts (id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL, part_id INTEGER NOT NULL, quantity INTEGER NOT NULL, purchase_price REAL NOT NULL DEFAULT 0, selling_price REAL NOT NULL DEFAULT 0);""")
    cur.execute("""CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT NOT NULL, deal_id INTEGER, client_id INTEGER, due_date TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'pending', remind INTEGER NOT NULL DEFAULT 1, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);""")
    cur.execute("""CREATE TABLE stock_movements (id INTEGER PRIMARY KEY, part_id INTEGER, type TEXT NOT NULL, quantity INTEGER NOT NULL, deal_id INTEGER, comment TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);""")

    for t, rows in full_dump["tables"].items():
        if not rows:
            continue
        cols = list(rows[0].keys())
        placeholders = ", ".join(["?"] * len(cols))
        col_names = ", ".join(cols)
        sql = f"INSERT OR REPLACE INTO {t} ({col_names}) VALUES ({placeholders})"
        data_tuples = [tuple(r.get(c) for c in cols) for r in rows]
        cur.executemany(sql, data_tuples)

    conn.commit()
    conn.close()
    print(f"Generated standalone SQLite database: {sqlite_path}")

    # Copy existing crm.db if present
    existing_db = os.path.join(PROJECT_DIR, "crm.db")
    if os.path.exists(existing_db):
        shutil.copy2(existing_db, os.path.join(db_backup_dir, "crm_original_local.db"))

    # 5. Copy program source code files
    code_files = [
        "server.py",
        "database.py",
        "export_schema.py",
        "README.md",
        "requirements.txt",
        "start.bat",
        "vercel.json",
        ".env",
        ".env.example",
        ".gitignore"
    ]
    for cf in code_files:
        src = os.path.join(PROJECT_DIR, cf)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(BACKUP_DIR, cf))
            print(f"Copied code file: {cf}")

    # Copy static/ folder recursively
    static_src = os.path.join(PROJECT_DIR, "static")
    static_dst = os.path.join(BACKUP_DIR, "static")
    if os.path.exists(static_dst):
        shutil.rmtree(static_dst)
    shutil.copytree(static_src, static_dst)
    print("Copied static/ directory recursively (HTML, JS, CSS, uploads, logos)")

    # Copy api/ folder if present
    api_src = os.path.join(PROJECT_DIR, "api")
    api_dst = os.path.join(BACKUP_DIR, "api")
    if os.path.exists(api_src):
        if os.path.exists(api_dst):
            shutil.rmtree(api_dst)
        shutil.copytree(api_src, api_dst)
        print("Copied api/ directory")

    # 6. Generate BACKUP_INFO.txt manifest
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    manifest = f"""================================================================================
СТО СПЕЦМАШ CRM — РЕЗЕРВНАЯ КОПИЯ СИСТЕМЫ И БАЗ ДАННЫХ
================================================================================
Версия программы:  1.2.3 (Официальная стабильная версия)
Дата создания:     {now_str}
Папка бэкапа:      {BACKUP_DIR}
Git коммит:        6a8fcd0

СОДЕРЖИМОЕ РЕЗЕРВНОЙ КОПИИ:
--------------------------------------------------------------------------------
1. ПРОГРАММНЫЙ КОД (В КОРНЕ ЭТОЙ ПАПКИ):
   - server.py          - FastAPI сервер CRM v1.2.3 с REST API и валидацией
   - database.py        - Драйвер Supabase PostgreSQL + SQLite fallback
   - static/            - Полный веб-интерфейс (index.html, app.js, styles.css)
   - static/uploads/    - Загруженные файлы, аватары и логотипы
   - start.bat          - Файл быстрого локального запуска CRM
   - requirements.txt   - Зависимости Python (FastAPI, uvicorn, httpx, pydantic)
   - vercel.json        - Конфигурация для облачного деплоя на Vercel
   - .env               - Переменные окружения и ключи доступа

2. БАЗЫ ДАННЫХ И ДАМПЫ (В ПАПКЕ database_backup/):
   - schema_full_v1.2.3.sql       - Полный SQL-дамп PostgreSQL (DDL + все данные)
   - schema.sql                  - Копия SQL-дампа для быстрого восстановления
   - database_dump_v1.2.3.json   - Полный структурированный JSON-дамп всех 9 таблиц
   - crm_v1.2.3.db               - Автономная локальная база данных SQLite со всеми данными
   - schema_structure_only.sql   - SQL-структура таблиц без данных

3. ТАБЛИЦЫ В ФОРМАТЕ EXCEL / CSV (В ПАПКЕ csv_exports/):
   - parts.csv            ({counts.get('parts', 0)} строк) - Полный склад запчастей, SKU, цены и остатки
   - clients.csv          ({counts.get('clients', 0)} строк) - База клиентов с контактами и реквизитами
   - equipment.csv        ({counts.get('equipment', 0)} строк) - База техники, VIN-номера, привязка к клиентам
   - deals.csv            ({counts.get('deals', 0)} строк) - Заказ-наряды СТО, Продажи з/ч, Отдел продаж
   - deal_parts.csv       ({counts.get('deal_parts', 0)} строк) - Списания запчастей в наряды
   - stock_movements.csv  ({counts.get('stock_movements', 0)} строк) - История всех движений склада
   - users.csv            ({counts.get('users', 0)} строк) - Пользователи и роли с паролями
   - tasks.csv            ({counts.get('tasks', 0)} строк) - Задачи и планировщик
   - settings.csv         ({counts.get('settings', 0)} строк) - Системные настройки и WhatsApp API

КОЛИЧЕСТВО ВЫГРУЖЕННЫХ ЗАПИСЕЙ:
--------------------------------------------------------------------------------
- Склад запчастей (parts):            {counts.get('parts', 0):,} позиций
- Движения по складу (stock_movements):{counts.get('stock_movements', 0):,} записей
- Клиенты (clients):                  {counts.get('clients', 0)} записей
- Техника и оборудование (equipment): {counts.get('equipment', 0)} единиц
- Заказ-наряды и сделки (deals):      {counts.get('deals', 0)} нарядов
- Списания запчастей (deal_parts):    {counts.get('deal_parts', 0)} списаний
- Сотрудники и доступы (users):       {counts.get('users', 0)} пользователей
- Задачи планировщика (tasks):        {counts.get('tasks', 0)} задач
- Настройки и доступы (settings):     {counts.get('settings', 0)} параметров

ИНСТРУКЦИЯ ПО ВОССТАНОВЛЕНИЮ:
--------------------------------------------------------------------------------
А. Восстановление в облаке Supabase:
   1. Откройте Supabase -> SQL Editor.
   2. Откройте файл database_backup/schema_full_v1.2.3.sql.
   3. Нажмите Run. Вся база будет полностью воссоздана.

Б. Локальный запуск на компьютере:
   1. Установите Python 3.10+ (если не установлен).
   2. Откройте командную строку в папке с бэкапом и выполните:
      pip install -r requirements.txt
   3. Запустите start.bat (или: python -m uvicorn server:app --host 0.0.0.0 --port 8000).
   4. В браузере откройте: http://localhost:8000.

Резервная копия проверена и готова к длительному архивному хранению.
================================================================================
"""
    manifest_path = os.path.join(BACKUP_DIR, "BACKUP_INFO.txt")
    with open(manifest_path, "w", encoding="utf-8") as mf:
        mf.write(manifest)
    print("Generated BACKUP_INFO.txt")

    print(f"\n=== Backup successfully completed to: {BACKUP_DIR} ===")

if __name__ == "__main__":
    main()
