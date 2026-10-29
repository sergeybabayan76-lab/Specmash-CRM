"""
Download and Generate Live SQLite (.db) Backup for Specmash CRM
Fetches 100% fresh data from Supabase and packages it into an optimized SQLite database file.
"""

import os
import sys
import json
import sqlite3
import shutil
from datetime import datetime
import database

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
            print(f"Error fetching {table}: {r.status_code} {r.text}", file=sys.stderr)
            break
        rows = r.json()
        if not rows:
            break
        all_rows.extend(rows)
        offset += len(rows)
        if len(rows) < chunk_size:
            break
    return all_rows

def create_sqlite_backup(target_path):
    if os.path.exists(target_path):
        os.remove(target_path)
    
    os.makedirs(os.path.dirname(os.path.abspath(target_path)), exist_ok=True)
    
    conn = sqlite3.connect(target_path)
    cur = conn.cursor()
    
    cur.execute("PRAGMA synchronous = OFF;")
    cur.execute("PRAGMA journal_mode = MEMORY;")

    # 1. Schema DDL
    cur.execute("""
    CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
    );
    """)

    cur.execute("""
    CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
    );
    """)

    cur.execute("""
    CREATE TABLE clients (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        company TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
    );
    """)

    cur.execute("""
    CREATE TABLE equipment (
        id INTEGER PRIMARY KEY,
        client_id INTEGER,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Спецтехника',
        serial_vin TEXT NOT NULL DEFAULT '',
        year INTEGER,
        operating_hours TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Исправна',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    );
    """)

    cur.execute("""
    CREATE TABLE parts (
        id INTEGER PRIMARY KEY,
        sku TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Запчасти',
        quantity INTEGER NOT NULL DEFAULT 0,
        min_threshold INTEGER NOT NULL DEFAULT 2,
        purchase_price REAL NOT NULL DEFAULT 0,
        selling_price REAL NOT NULL DEFAULT 0,
        location TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
    );
    """)

    cur.execute("""
    CREATE TABLE deals (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        client_id INTEGER,
        equipment_id INTEGER,
        stage TEXT NOT NULL DEFAULT 'new',
        amount REAL NOT NULL DEFAULT 0,
        cost REAL NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'normal',
        responsible TEXT NOT NULL DEFAULT 'Мастер-приемщик',
        description TEXT NOT NULL DEFAULT '',
        deadline TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
        FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE SET NULL
    );
    """)

    cur.execute("""
    CREATE TABLE deal_parts (
        id INTEGER PRIMARY KEY,
        deal_id INTEGER NOT NULL,
        part_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        purchase_price REAL NOT NULL DEFAULT 0,
        selling_price REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
        FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE
    );
    """)

    cur.execute("""
    CREATE TABLE tasks (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        deal_id INTEGER,
        client_id INTEGER,
        due_date TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'normal',
        status TEXT NOT NULL DEFAULT 'pending',
        remind INTEGER NOT NULL DEFAULT 1,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    );
    """)

    cur.execute("""
    CREATE TABLE stock_movements (
        id INTEGER PRIMARY KEY,
        part_id INTEGER,
        type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        deal_id INTEGER,
        comment TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE SET NULL,
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL
    );
    """)

    cur.execute("""
    CREATE TABLE whatsapp_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        clean_phone TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL DEFAULT '',
        template TEXT DEFAULT '',
        sent_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        detail TEXT NOT NULL DEFAULT ''
    );
    """)

    tables = [
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

    counts = {}

    for t, order_col in tables:
        rows = fetch_all(t, order_col)
        counts[t] = len(rows)
        if not rows:
            continue
        cols = list(rows[0].keys())
        placeholders = ", ".join(["?"] * len(cols))
        col_names = ", ".join(cols)
        sql = f"INSERT OR REPLACE INTO {t} ({col_names}) VALUES ({placeholders})"
        tuples = [tuple(r.get(c) for c in cols) for r in rows]
        cur.executemany(sql, tuples)
        print(f"Inserted into {t}: {len(rows)} records")

    # Also parse and insert whatsapp_logs from settings if present
    cur.execute("SELECT value FROM settings WHERE key = 'whatsapp_logs_json'")
    wlog_row = cur.fetchone()
    if wlog_row and wlog_row[0]:
        try:
            wlogs = json.loads(wlog_row[0])
            for wl in wlogs:
                cur.execute("""
                INSERT INTO whatsapp_logs (phone, clean_phone, text, template, sent_at, status, detail)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    wl.get('phone', ''),
                    wl.get('clean_phone', ''),
                    wl.get('text', ''),
                    wl.get('template') or '',
                    wl.get('sent_at', ''),
                    wl.get('status', 'pending'),
                    wl.get('detail', '')
                ))
            counts['whatsapp_logs'] = len(wlogs)
            print(f"Inserted into whatsapp_logs: {len(wlogs)} records")
        except Exception as e:
            print("Could not parse whatsapp_logs_json:", e)

    # 2. Indexes
    cur.execute("CREATE INDEX IF NOT EXISTS equipment_client_id_idx ON equipment(client_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS deals_client_id_idx ON deals(client_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS deals_equipment_id_idx ON deals(equipment_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS deals_stage_idx ON deals(stage);")
    cur.execute("CREATE INDEX IF NOT EXISTS deal_parts_deal_id_idx ON deal_parts(deal_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS deal_parts_part_id_idx ON deal_parts(part_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS tasks_client_id_idx ON tasks(client_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS tasks_deal_id_idx ON tasks(deal_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS stock_movements_part_id_idx ON stock_movements(part_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS stock_movements_deal_id_idx ON stock_movements(deal_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS parts_sku_idx ON parts(sku);")
    cur.execute("CREATE INDEX IF NOT EXISTS parts_category_idx ON parts(category);")

    conn.commit()
    
    # 3. Optimize and verify
    cur.execute("PRAGMA integrity_check;")
    integrity = cur.fetchone()[0]
    print(f"Integrity check: {integrity}")

    cur.execute("VACUUM;")
    conn.commit()
    conn.close()

    return counts

if __name__ == "__main__":
    now_tag = datetime.now().strftime("%Y-%m-%d")
    downloads_file = r"C:\Users\079\Downloads\crm.db"
    downloads_dated = rf"C:\Users\079\Downloads\specmash_crm_{now_tag}.db"
    d_drive_file = r"D:\CRM\backup\версия 1.2.3\database_backup\crm_v1.2.3.db"
    d_drive_latest = r"D:\CRM\backup\crm_latest.db"
    local_repo_file = r"C:\Users\079\.gemini\antigravity\scratch\tech-crm\crm.db"

    print(f"Generating live SQLite backup to: {downloads_file} ...")
    counts = create_sqlite_backup(downloads_file)
    
    # Copy to all target destinations
    shutil.copy2(downloads_file, downloads_dated)
    shutil.copy2(downloads_file, local_repo_file)
    
    if os.path.exists(r"D:\CRM\backup"):
        os.makedirs(r"D:\CRM\backup\версия 1.2.3\database_backup", exist_ok=True)
        shutil.copy2(downloads_file, d_drive_file)
        shutil.copy2(downloads_file, d_drive_latest)
        print(f"Copied to: {d_drive_file}")
        print(f"Copied to: {d_drive_latest}")

    file_size = os.path.getsize(downloads_file)
    print("\n=== Backup Summary ===")
    print(f"File: {downloads_file}")
    print(f"Size: {file_size:,} bytes ({file_size / 1024:.1f} KB)")
    print("Table Counts:")
    for t, c in counts.items():
        print(f"  - {t}: {c:,} rows")
    print("=== Successfully completed ===")
