"""
Database management and models for СТО Спецмаш CRM.
Uses SQLite with optimized schema, foreign keys, user authentication, and pre-seeded demo data.
"""

import sqlite3
import os
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import shutil

# Vercel serverless environment support (ephemeral writable storage in /tmp)
IS_VERCEL = bool(os.environ.get("VERCEL"))
if IS_VERCEL:
    DB_PATH = "/tmp/crm.db"
else:
    DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "crm.db")

def ensure_db_file():
    """Ensures /tmp/crm.db exists and has full read-write permissions (0o666)."""
    if not IS_VERCEL:
        return
    SEED_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "crm.db")
    if not os.path.exists(DB_PATH) or os.path.getsize(DB_PATH) == 0:
        if os.path.exists(SEED_DB) and os.path.getsize(SEED_DB) > 0:
            try:
                # Use copyfile (NOT copy2) so read-only permissions from Lambda image are NOT copied!
                shutil.copyfile(SEED_DB, DB_PATH)
            except Exception:
                pass
    try:
        if os.path.exists(DB_PATH):
            os.chmod(DB_PATH, 0o666)
    except Exception:
        pass

def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return hashed, salt

def verify_password(password: str, hashed: str, salt: str) -> bool:
    new_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(new_hash, hashed)

def get_connection() -> sqlite3.Connection:
    if IS_VERCEL:
        ensure_db_file()

    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    if IS_VERCEL:
        try:
            # Lambda /tmp filesystems can have locking issues with WAL mode; DELETE mode is safe
            conn.execute("PRAGMA journal_mode = DELETE;")
        except Exception:
            pass
    else:
        try:
            conn.execute("PRAGMA journal_mode = WAL;")
        except Exception:
            pass

    # Ensure tables exist even on fresh ephemeral start
    try:
        c = conn.cursor()
        c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        if not c.fetchone():
            init_db_schema(conn)
    except Exception:
        pass

    return conn

def init_db():
    conn = get_connection()
    conn.close()

def init_db_schema(conn: sqlite3.Connection):
    cursor = conn.cursor()

    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL, -- 'admin', 'moderator', 'mechanic'
        phone TEXT,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );

    CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        company TEXT,
        phone TEXT NOT NULL,
        email TEXT,
        address TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        serial_vin TEXT,
        year INTEGER,
        operating_hours TEXT,
        status TEXT NOT NULL DEFAULT 'Исправна',
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS parts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        min_threshold INTEGER NOT NULL DEFAULT 2,
        purchase_price REAL NOT NULL DEFAULT 0.0,
        selling_price REAL NOT NULL DEFAULT 0.0,
        location TEXT,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        client_id INTEGER,
        equipment_id INTEGER,
        stage TEXT NOT NULL DEFAULT 'new',
        amount REAL NOT NULL DEFAULT 0.0,
        cost REAL NOT NULL DEFAULT 0.0,
        priority TEXT NOT NULL DEFAULT 'normal',
        responsible TEXT NOT NULL DEFAULT 'Мастер-приемщик',
        description TEXT,
        deadline TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL,
        FOREIGN KEY (equipment_id) REFERENCES equipment (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS deal_parts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deal_id INTEGER NOT NULL,
        part_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        purchase_price REAL NOT NULL,
        selling_price REAL NOT NULL,
        FOREIGN KEY (deal_id) REFERENCES deals (id) ON DELETE CASCADE,
        FOREIGN KEY (part_id) REFERENCES parts (id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        deal_id INTEGER,
        client_id INTEGER,
        due_date TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal',
        status TEXT NOT NULL DEFAULT 'pending',
        remind INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (deal_id) REFERENCES deals (id) ON DELETE SET NULL,
        FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        part_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        deal_id INTEGER,
        comment TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (part_id) REFERENCES parts (id) ON DELETE CASCADE,
        FOREIGN KEY (deal_id) REFERENCES deals (id) ON DELETE SET NULL
    );
    """)

    conn.commit()

    # Seed default settings if not exist
    cursor.execute("SELECT COUNT(*) FROM settings")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("INSERT INTO settings (key, value) VALUES (?, ?)", [
            ("company_name", "СТО Спецмаш"),
            ("company_slogan", "Сервис спецтехники, грузовых авто и оборудования"),
            ("company_phone", "+374 99 999999"),
            ("company_email", "info@specmash-sto.am"),
            ("company_address", "г. Ереван, ул. Себастия, 12"),
            ("company_tin", "02589412"),
            ("currency", "AMD"),
            ("default_responsible", "Иванов Алексей Викторович (Директор)"),
            ("warranty_months", "6"),
            ("logo_url", ""),
        ])
        conn.commit()

    # Seed default users if not exist
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        seed_default_users(conn)

    # Seed clients/equipment/parts if not exist
    cursor.execute("SELECT COUNT(*) FROM clients")
    if cursor.fetchone()[0] == 0:
        seed_demo_data(conn)

    conn.commit()

def seed_default_users(conn: sqlite3.Connection):
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 1. Admin
    h_admin, s_admin = hash_password("admin123")
    # 2. Moderator
    h_mod, s_mod = hash_password("mod123")
    # 3. Mechanic
    h_mech, s_mech = hash_password("mech123")

    users_data = [
        ("admin", h_admin, s_admin, "Иванов Алексей Викторович (Директор)", "admin", "+37499112233", now_str),
        ("moderator", h_mod, s_mod, "Смирнова Елена Павловна (Мастер-приемщик)", "moderator", "+37499223344", now_str),
        ("mechanic", h_mech, s_mech, "Петров Сергей Иванович (Старший механик)", "mechanic", "+37499334455", now_str),
    ]

    cursor.executemany("""
    INSERT INTO users (username, password_hash, salt, full_name, role, phone, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, users_data)
    conn.commit()

def seed_demo_data(conn: sqlite3.Connection):
    cursor = conn.cursor()
    now = datetime.now()
    def dt_str(days_ago=0, hours_ago=0):
        return (now - timedelta(days=days_ago, hours=hours_ago)).strftime("%Y-%m-%d %H:%M:%S")

    # 1. Clients with +374 phone numbers
    clients_data = [
        (1, "Иван Александрович Ковалев", "ООO «СтройТранс»", "+37499234567", "kovalev@stroytrans.ru", "г. Ереван, ул. Себастия, 12", "Постоянный заказчик, парк спецтехники 5 единиц", dt_str(45)),
        (2, "Дмитрий Сергеевич Морозов", "ИП Морозов Д.С.", "+37499445891", "dm.morozov@agro-tech.com", "г. Абовян, ул. Полевая, 5", "Сельхозпредприятие, сезонные ТО", dt_str(30)),
        (3, "Алексей Викторович Воронов", "АО «Северный Карьер»", "+37499789123", "voronov@sevkar.ru", "г. Раздан, Промзона 3", "Тяжелая карьерная техника, оперативный ремонт", dt_str(20)),
        (4, "Михаил Павлович Соколов", "ООО «ЛогистикАвто»", "+37499333221", "sokolov@logistic-auto.ru", "г. Гюмри, ул. Тигран Мец, 19", "Грузоперевозки, фуры и тягачи", dt_str(15)),
        (5, "Сергей Николаевич Григорьев", "Частный заказчик", "+37499554120", "grigoryev_sn@gmail.com", "г. Ванадзор, ул. Тарон, 4", "Частный экскаватор CASE и мини-погрузчик", dt_str(10)),
    ]

    cursor.executemany("""
    INSERT OR REPLACE INTO clients (id, name, company, phone, email, address, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, clients_data)

    # 2. Equipment (Using CASE instead of JCB)
    equipment_data = [
        (1, 1, "Экскаватор-погрузчик CASE 580T", "Спецтехника", "CASE580-2019-98421", 2019, "5 400 м/ч", "В ремонте", "Плановое ТО 5000 + ремонт гидравлики стрелы CASE", dt_str(45)),
        (2, 1, "Мини-погрузчик Bobcat S530", "Спецтехника", "BBS530-2021-3312", 2021, "2 800 м/ч", "Исправна", "Замена масла и фильтров проведена", dt_str(40)),
        (3, 2, "Трактор МТЗ Беларус 1221.2", "Сельхозтехника", "MTZ1221-2018-771", 2018, "6 200 м/ч", "На диагностике", "Шум в КПП при включении 3-й передачи", dt_str(30)),
        (4, 3, "Гусеничный экскаватор Komatsu PC210", "Тяжелая техника", "KMTPC210-2017-5509", 2017, "9 100 м/ч", "Ожидание запчастей", "Требуется замена гидронасоса и РВД", dt_str(20)),
        (5, 3, "Фронтальный погрузчик Liugong CLG856", "Спецтехника", "LG856-2020-0091", 2020, "4 650 м/ч", "Исправна", "Регулярное обслуживание", dt_str(18)),
        (6, 4, "Седельный тягач КАМАЗ-5490 Neo", "Грузовые авто", "XTC549000L1294851", 2020, "320 000 км", "Готово к выдаче", "Капитальный ремонт ходовой части", dt_str(15)),
        (7, 5, "Мини-экскаватор Kubota KX057-4", "Спецтехника", "KUBKX057-2022-114", 2022, "1 450 м/ч", "В ремонте", "Замена гидроцилиндра ковша", dt_str(10)),
        (8, 1, "Дизельный генератор SDMO J130K", "Генераторы/ДГУ", "SDMO130-2019-482", 2019, "1 800 м/ч", "Исправна", "Резервный генератор базы", dt_str(35)),
    ]

    cursor.executemany("""
    INSERT OR REPLACE INTO equipment (id, client_id, name, category, serial_vin, year, operating_hours, status, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, equipment_data)

    # 3. Warehouse Parts (Using CASE instead of JCB, amounts in AMD)
    parts_data = [
        (1, "FL-CASE-01", "Фильтр масляный CASE (84284102)", "Фильтры", 18, 5, 12000.0, 24000.0, "Стеллаж А-1", dt_str(60)),
        (2, "FL-CASE-02", "Фильтр гидравлический CASE (84475948)", "Фильтры", 8, 4, 38000.0, 65000.0, "Стеллаж А-1", dt_str(60)),
        (3, "FL-AIR-03", "Фильтр воздушный комплект Donaldson", "Фильтры", 12, 3, 29000.0, 52000.0, "Стеллаж А-2", dt_str(55)),
        (4, "OIL-SH-01", "Масло гидравлическое Shell Tellus S2 V46 (20л)", "Масла и техжидкости", 14, 5, 75000.0, 128000.0, "Секция Г-3", dt_str(50)),
        (5, "OIL-ENG-15W", "Масло моторное Total Rubia 15W-40 (20л)", "Масла и техжидкости", 10, 4, 62000.0, 105000.0, "Секция Г-3", dt_str(50)),
        (6, "HYD-RVD-01", "Рукав высокого давления (РВД) 2SN DN12 1.5м", "Гидравлика", 6, 4, 21000.0, 42000.0, "Стеллаж В-2", dt_str(40)),
        (7, "HYD-PUMP-KM", "Насос гидравлический основной Komatsu PC210", "Гидравлика", 1, 1, 1850000.0, 2600000.0, "Зона Крупногабарит", dt_str(20)),
        (8, "CYL-SEAL-01", "Ремкомплект гидроцилиндра ковша CASE 580", "Гидравлика", 7, 3, 31000.0, 59000.0, "Стеллаж Б-1", dt_str(45)),
        (9, "BELT-GT-01", "Ремень поликлиновой генератора Gates 8PK1420", "Расходники", 15, 5, 8500.0, 18000.0, "Стеллаж Б-2", dt_str(40)),
        (10, "BRK-WBC-01", "Тормозные накладки КАМАЗ-5490 комплект", "Ходовая", 4, 2, 45000.0, 89000.0, "Стеллаж Д-1", dt_str(30)),
        (11, "EL-STR-24V", "Стартер 24V 6.0kW редукторный", "Электрика", 2, 2, 160000.0, 265000.0, "Стеллаж В-4", dt_str(35)),
        (12, "CUT-TOOTH-01", "Коронка зуба ковша CASE Standard + палец", "Навесное", 24, 10, 11000.0, 23000.0, "Стеллаж Е-1", dt_str(50)),
        (13, "ANT-G12-10L", "Антифриз концентрат G12 Red (10л)", "Масла и техжидкости", 3, 5, 23000.0, 41000.0, "Секция Г-2", dt_str(30)),
    ]

    cursor.executemany("""
    INSERT OR REPLACE INTO parts (id, sku, name, category, quantity, min_threshold, purchase_price, selling_price, location, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, parts_data)

    # 4. Deals (in AMD)
    deals_data = [
        (1, "Комплексное ТО 2500 м/ч + замена колодок", 1, 2, "completed", 685000.0, 245000.0, "normal", "Петров Сергей", "Выполнено плановое ТО, заменены все фильтры и масла, отрегулирован стояночный тормоз.", dt_str(12), dt_str(25), dt_str(12)),
        (2, "Капитальный ремонт ходовой части КАМАЗ", 4, 6, "completed", 1450000.0, 520000.0, "high", "Петров Сергей", "Замена тормозных барабанов, колодок, сайлентблоков, ревизия пневмосистемы. Оплачено по безналу.", dt_str(8), dt_str(20), dt_str(8)),
        (3, "Ремонт гидромолота и замена РВД", 5, 7, "completed", 420000.0, 142000.0, "normal", "Смирнова Елена", "Устранены подтеки гидравлики, опрессованы новые рукава 2SN.", dt_str(5), dt_str(15), dt_str(5)),
        (4, "Замена гидронасоса и промывка системы Komatsu", 3, 4, "parts_waiting", 3450000.0, 2100000.0, "urgent", "Иванов Алексей", "Насос заказан у поставщика, ожидается поступление на склад в четверг. Техника на спецстоянке.", dt_str(0, -72), dt_str(6), None),
        (5, "Ремонт гидроцилиндра стрелы CASE 580", 1, 1, "in_progress", 780000.0, 280000.0, "high", "Петров Сергей", "Расточка проушины, замена штока и полиуретановых уплотнений CASE, сборка и проверка давлением.", dt_str(0, -48), dt_str(4), None),
        (6, "Капитальный ремонт КПП трактора Беларус", 2, 3, "diagnostic", 950000.0, 360000.0, "high", "Петров Сергей", "Снята коробка передач, дефектовка вторичного вала и синхронизатора 3-й передачи.", dt_str(0, -96), dt_str(3), None),
        (7, "Сезонная консервация ДГУ SDMO", 1, 8, "estimate", 290000.0, 95000.0, "normal", "Смирнова Елена", "Смета сформирована, ожидает согласования главного инженера ООО «СтройТранс».", dt_str(0, -24), dt_str(2), None),
        (8, "Заявка: подтекание антифриза Liugong CLG856", 3, 5, "new", 380000.0, 110000.0, "urgent", "Смирнова Елена", "Водитель заметил лужу под радиатором. Требуется опрессовка системы охлаждения.", dt_str(0, -12), dt_str(1), None),
        (9, "ТО 1000 моточасов Kubota KX057", 5, 7, "ready", 460000.0, 160000.0, "normal", "Петров Сергей", "Все работы выполнены, машина вымыта, ожидает забора заказчиком.", dt_str(0, -36), dt_str(5), None),
    ]

    cursor.executemany("""
    INSERT OR REPLACE INTO deals (id, title, client_id, equipment_id, stage, amount, cost, priority, responsible, description, deadline, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, deals_data)

    # 5. Deal Parts
    deal_parts_data = [
        (1, 1, 2, 12000.0, 24000.0),
        (1, 3, 1, 29000.0, 52000.0),
        (1, 5, 1, 62000.0, 105000.0),
        (2, 10, 4, 45000.0, 89000.0),
        (3, 6, 2, 21000.0, 42000.0),
        (3, 8, 1, 31000.0, 59000.0),
        (5, 8, 2, 31000.0, 59000.0),
        (5, 4, 1, 75000.0, 128000.0),
    ]

    cursor.executemany("""
    INSERT INTO deal_parts (deal_id, part_id, quantity, purchase_price, selling_price)
    VALUES (?, ?, ?, ?, ?)
    """, deal_parts_data)

    # 6. Tasks
    tasks_data = [
        ("Связаться с заказчиком по смете ДГУ SDMO", 7, 1, (now + timedelta(hours=4)).strftime("%Y-%m-%d %H:%M"), "high", "pending", 1, "Уточнить способ оплаты: безналичный расчет или наличные в AMD.", dt_str(1)),
        ("Проверить поступление гидронасоса Komatsu от ТК", 4, 3, (now + timedelta(days=1)).strftime("%Y-%m-%d 11:00"), "high", "pending", 1, "Трек-номер: AM-992144. Созвониться со складом.", dt_str(2)),
        ("Уведомить Григорьева С.Н. о готовности мини-экскаватора Kubota", 9, 5, (now + timedelta(hours=2)).strftime("%Y-%m-%d 15:00"), "normal", "pending", 1, "Выдать акт выполненных работ и гарантийный талон на 6 мес.", dt_str(1)),
        ("Заказать антифриз G12 (остаток ниже минимального порога!)", None, None, (now - timedelta(hours=6)).strftime("%Y-%m-%d 10:00"), "urgent", "pending", 1, "На складе осталось 3 канистры, мин. порог 5.", dt_str(1)),
        ("Подготовить акт дефектовки КПП МТЗ Беларус", 6, 2, (now + timedelta(days=2)).strftime("%Y-%m-%d 17:00"), "normal", "in_progress", 1, "Приложить фотографии износа шестерен 3-й передачи.", dt_str(2)),
        ("Согласовать договор на годовое сервисное ТО парка «СтройТранс»", None, 1, (now + timedelta(days=5)).strftime("%Y-%m-%d 12:00"), "high", "pending", 1, "Встреча в офисе заказчика.", dt_str(3)),
        ("Отправить закрывающие документы по КАМАЗ в бухгалтерию «ЛогистикАвто»", 2, 4, (now - timedelta(days=1)).strftime("%Y-%m-%d 16:00"), "normal", "completed", 0, "Счет-фактура и акт подписаны.", dt_str(4)),
    ]

    cursor.executemany("""
    INSERT INTO tasks (title, deal_id, client_id, due_date, priority, status, remind, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, tasks_data)

    # 7. Stock movements
    stock_movements_data = [
        (4, "incoming", 20, None, "Поступление партии масел Shell от официального дистрибьютора", dt_str(50)),
        (5, "incoming", 15, None, "Приход моторного масла Total Rubia", dt_str(50)),
        (1, "outgoing", 2, 1, "Списание на заказ-наряд №1 (ТО Bobcat)", dt_str(12)),
        (10, "outgoing", 4, 2, "Списание на ремонт тормозной системы КАМАЗ №2", dt_str(8)),
        (6, "outgoing", 2, 3, "Списание РВД на заказ-наряд №3", dt_str(5)),
        (8, "outgoing", 2, 5, "Резерв под заказ-наряд №5 (Ремонт CASE)", dt_str(3)),
    ]

    cursor.executemany("""
    INSERT INTO stock_movements (part_id, type, quantity, deal_id, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    """, stock_movements_data)

    conn.commit()

# --- Query helpers ---

def get_dashboard_metrics() -> Dict[str, Any]:
    conn = get_connection()
    c = conn.cursor()

    # Total revenue and cost from completed deals
    c.execute("""
        SELECT 
            COALESCE(SUM(amount), 0) as total_revenue,
            COALESCE(SUM(cost), 0) as total_cost,
            COUNT(*) as completed_count
        FROM deals 
        WHERE stage = 'completed'
    """)
    completed_row = c.fetchone()
    total_revenue = completed_row["total_revenue"]
    total_cost = completed_row["total_cost"]
    net_profit = total_revenue - total_cost
    completed_count = completed_row["completed_count"]
    avg_deal = (total_revenue / completed_count) if completed_count > 0 else 0

    # Pipeline active deals
    c.execute("""
        SELECT 
            COUNT(*) as active_count,
            COALESCE(SUM(amount), 0) as active_volume
        FROM deals 
        WHERE stage NOT IN ('completed', 'cancelled')
    """)
    active_row = c.fetchone()

    # Total clients, equipment, employees
    c.execute("SELECT COUNT(*) FROM clients")
    total_clients = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM equipment")
    total_equipment = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM users")
    total_users = c.fetchone()[0]

    # Parts low stock count
    c.execute("SELECT COUNT(*) FROM parts WHERE quantity <= min_threshold")
    low_stock_parts = c.fetchone()[0]

    # Inventory valuation
    c.execute("SELECT COALESCE(SUM(quantity * purchase_price), 0), COALESCE(SUM(quantity * selling_price), 0) FROM parts")
    inv_row = c.fetchone()
    inventory_cost = inv_row[0]
    inventory_retail = inv_row[1]

    # Overdue tasks
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    c.execute("SELECT COUNT(*) FROM tasks WHERE status != 'completed' AND due_date < ?", (now_str,))
    overdue_tasks = c.fetchone()[0]

    # Deals by stage
    c.execute("SELECT stage, COUNT(*) as cnt, COALESCE(SUM(amount), 0) as val FROM deals GROUP BY stage")
    deals_by_stage = {r["stage"]: {"count": r["cnt"], "amount": r["val"]} for r in c.fetchall()}

    # Recent activity
    c.execute("""
        SELECT d.id, d.title, d.amount, d.stage, d.created_at, c.name as client_name, eq.name as equipment_name
        FROM deals d
        LEFT JOIN clients c ON d.client_id = c.id
        LEFT JOIN equipment eq ON d.equipment_id = eq.id
        ORDER BY d.id DESC LIMIT 5
    """)
    recent_deals = [dict(r) for r in c.fetchall()]

    conn.close()

    return {
        "total_revenue": round(total_revenue, 2),
        "total_cost": round(total_cost, 2),
        "net_profit": round(net_profit, 2),
        "margin_percent": round((net_profit / total_revenue * 100), 1) if total_revenue > 0 else 0,
        "completed_count": completed_count,
        "avg_deal": round(avg_deal, 2),
        "active_deals_count": active_row["active_count"],
        "active_deals_volume": round(active_row["active_volume"], 2),
        "total_clients": total_clients,
        "total_equipment": total_equipment,
        "total_users": total_users,
        "low_stock_parts": low_stock_parts,
        "inventory_cost": round(inventory_cost, 2),
        "inventory_retail": round(inventory_retail, 2),
        "overdue_tasks": overdue_tasks,
        "deals_by_stage": deals_by_stage,
        "recent_deals": recent_deals
    }

def dump_all_data() -> Dict[str, Any]:
    conn = get_connection()
    c = conn.cursor()
    data = {}
    
    # settings
    c.execute("SELECT key, value FROM settings")
    data["settings"] = {r["key"]: r["value"] for r in c.fetchall()}
    
    # users
    c.execute("SELECT id, username, password_hash, salt, full_name, role, phone, created_at FROM users")
    data["users"] = [dict(r) for r in c.fetchall()]
    
    # clients
    c.execute("SELECT id, name, company, phone, email, address, notes, created_at FROM clients")
    data["clients"] = [dict(r) for r in c.fetchall()]
    
    # equipment
    c.execute("SELECT id, client_id, name, category, serial_vin, year, operating_hours, status, notes, created_at FROM equipment")
    data["equipment"] = [dict(r) for r in c.fetchall()]
    
    # parts
    c.execute("SELECT id, sku, name, category, quantity, min_threshold, purchase_price, selling_price, location, created_at FROM parts")
    data["parts"] = [dict(r) for r in c.fetchall()]
    
    # deals
    c.execute("SELECT id, title, client_id, equipment_id, stage, amount, cost, priority, responsible, description, deadline, created_at, completed_at FROM deals")
    data["deals"] = [dict(r) for r in c.fetchall()]
    
    # deal_parts
    c.execute("SELECT id, deal_id, part_id, quantity, purchase_price, selling_price FROM deal_parts")
    data["deal_parts"] = [dict(r) for r in c.fetchall()]
    
    # tasks
    c.execute("SELECT id, title, deal_id, client_id, due_date, priority, status, remind, notes, created_at FROM tasks")
    data["tasks"] = [dict(r) for r in c.fetchall()]
    
    # stock_movements
    c.execute("SELECT id, part_id, type, quantity, deal_id, comment, created_at FROM stock_movements")
    data["stock_movements"] = [dict(r) for r in c.fetchall()]
    
    conn.close()
    return data

def restore_all_data(data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    c = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    counts = {}
    
    try:
        # Settings
        if "settings" in data and isinstance(data["settings"], dict):
            for k, v in data["settings"].items():
                c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, str(v)))
            counts["settings"] = len(data["settings"])

        # Users
        if "users" in data and isinstance(data["users"], list):
            user_cnt = 0
            for u in data["users"]:
                username = u.get("username", "").strip().lower()
                if not username:
                    continue
                p_hash = u.get("password_hash")
                salt = u.get("salt")
                if not p_hash or not salt:
                    plain_pass = u.get("password") or "pass123"
                    p_hash, salt = hash_password(plain_pass)
                
                c.execute("""
                    INSERT INTO users (id, username, password_hash, salt, full_name, role, phone, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(username) DO UPDATE SET
                        full_name=excluded.full_name,
                        role=excluded.role,
                        phone=excluded.phone,
                        password_hash=excluded.password_hash,
                        salt=excluded.salt
                """, (
                    u.get("id"),
                    username,
                    p_hash,
                    salt,
                    u.get("full_name", username),
                    u.get("role", "mechanic"),
                    u.get("phone", ""),
                    u.get("created_at", now_str)
                ))
                user_cnt += 1
            counts["users"] = user_cnt

        # Clients
        if "clients" in data and isinstance(data["clients"], list):
            cl_cnt = 0
            for cl in data["clients"]:
                name = cl.get("name", "").strip()
                if not name:
                    continue
                c.execute("""
                    INSERT OR REPLACE INTO clients (id, name, company, phone, email, address, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    cl.get("id"),
                    name,
                    cl.get("company", ""),
                    cl.get("phone", "+37499999999"),
                    cl.get("email", ""),
                    cl.get("address", ""),
                    cl.get("notes", ""),
                    cl.get("created_at", now_str)
                ))
                cl_cnt += 1
            counts["clients"] = cl_cnt

        # Equipment
        if "equipment" in data and isinstance(data["equipment"], list):
            eq_cnt = 0
            for eq in data["equipment"]:
                name = eq.get("name", "").strip()
                if not name:
                    continue
                client_id = eq.get("client_id")
                if client_id and client_id > 0:
                    c.execute("SELECT id FROM clients WHERE id = ?", (client_id,))
                    if not c.fetchone():
                        client_id = None
                else:
                    client_id = None

                c.execute("""
                    INSERT OR REPLACE INTO equipment (id, client_id, name, category, serial_vin, year, operating_hours, status, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    eq.get("id"),
                    client_id,
                    name,
                    eq.get("category", "Спецтехника"),
                    eq.get("serial_vin", ""),
                    eq.get("year"),
                    eq.get("operating_hours", ""),
                    eq.get("status", "Исправна"),
                    eq.get("notes", ""),
                    eq.get("created_at", now_str)
                ))
                eq_cnt += 1
            counts["equipment"] = eq_cnt

        # Parts
        if "parts" in data and isinstance(data["parts"], list):
            pt_cnt = 0
            for p in data["parts"]:
                sku = p.get("sku", "").strip()
                name = p.get("name", "").strip()
                if not sku or not name:
                    continue
                c.execute("""
                    INSERT INTO parts (id, sku, name, category, quantity, min_threshold, purchase_price, selling_price, location, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(sku) DO UPDATE SET
                        name=excluded.name,
                        category=excluded.category,
                        quantity=excluded.quantity,
                        min_threshold=excluded.min_threshold,
                        purchase_price=excluded.purchase_price,
                        selling_price=excluded.selling_price,
                        location=excluded.location
                """, (
                    p.get("id"),
                    sku,
                    name,
                    p.get("category", "Запчасти"),
                    p.get("quantity", 0),
                    p.get("min_threshold", 2),
                    p.get("purchase_price", 0.0),
                    p.get("selling_price", 0.0),
                    p.get("location", ""),
                    p.get("created_at", now_str)
                ))
                pt_cnt += 1
            counts["parts"] = pt_cnt

        # Deals
        if "deals" in data and isinstance(data["deals"], list):
            dl_cnt = 0
            for d in data["deals"]:
                title = d.get("title", "").strip()
                if not title:
                    continue
                client_id = d.get("client_id")
                if client_id and client_id > 0:
                    c.execute("SELECT id FROM clients WHERE id = ?", (client_id,))
                    if not c.fetchone():
                        client_id = None
                else:
                    client_id = None

                equipment_id = d.get("equipment_id")
                if equipment_id and equipment_id > 0:
                    c.execute("SELECT id FROM equipment WHERE id = ?", (equipment_id,))
                    if not c.fetchone():
                        equipment_id = None
                else:
                    equipment_id = None

                c.execute("""
                    INSERT OR REPLACE INTO deals (id, title, client_id, equipment_id, stage, amount, cost, priority, responsible, description, deadline, created_at, completed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    d.get("id"),
                    title,
                    client_id,
                    equipment_id,
                    d.get("stage", "new"),
                    d.get("amount", 0.0),
                    d.get("cost", 0.0),
                    d.get("priority", "normal"),
                    d.get("responsible", "Мастер-приемщик"),
                    d.get("description", ""),
                    d.get("deadline"),
                    d.get("created_at", now_str),
                    d.get("completed_at")
                ))
                dl_cnt += 1
            counts["deals"] = dl_cnt

        # Tasks
        if "tasks" in data and isinstance(data["tasks"], list):
            tsk_cnt = 0
            for t in data["tasks"]:
                title = t.get("title", "").strip()
                if not title:
                    continue
                deal_id = t.get("deal_id")
                if deal_id and deal_id > 0:
                    c.execute("SELECT id FROM deals WHERE id = ?", (deal_id,))
                    if not c.fetchone():
                        deal_id = None
                else:
                    deal_id = None

                client_id = t.get("client_id")
                if client_id and client_id > 0:
                    c.execute("SELECT id FROM clients WHERE id = ?", (client_id,))
                    if not c.fetchone():
                        client_id = None
                else:
                    client_id = None

                c.execute("""
                    INSERT OR REPLACE INTO tasks (id, title, deal_id, client_id, due_date, priority, status, remind, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    t.get("id"),
                    title,
                    deal_id,
                    client_id,
                    t.get("due_date", now_str),
                    t.get("priority", "normal"),
                    t.get("status", "pending"),
                    t.get("remind", 1),
                    t.get("notes", ""),
                    t.get("created_at", now_str)
                ))
                tsk_cnt += 1
            counts["tasks"] = tsk_cnt

        conn.commit()
    finally:
        conn.close()

    return counts
