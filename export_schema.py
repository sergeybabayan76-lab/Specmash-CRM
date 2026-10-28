"""
Database Exporter for Specmash CRM v1.2.3
Generates complete schema.sql with updated tables, constraints, indexes, RLS, and all real data.
"""

import sys
import os
import re
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

def sql_quote(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    # String or other type
    s = str(val)
    # Escape single quotes
    escaped = s.replace("'", "''")
    return f"'{escaped}'"

def generate_inserts(table_name, rows, columns, conflict_col=None, batch_size=200):
    if not rows:
        return f"-- Таблица {table_name}: нет данных для вставки\n\n"
    
    col_str = ", ".join(columns)
    sql_lines = [f"-- Данные таблицы: {table_name} ({len(rows)} записей)"]
    
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        vals_list = []
        for r in batch:
            row_vals = [sql_quote(r.get(c)) for c in columns]
            vals_list.append(f"    ({', '.join(row_vals)})")
        
        insert_stmt = f"INSERT INTO public.{table_name} ({col_str}) VALUES\n" + ",\n".join(vals_list)
        if conflict_col:
            insert_stmt += f"\nON CONFLICT ({conflict_col}) DO NOTHING;"
        else:
            insert_stmt += ";"
        sql_lines.append(insert_stmt)
    
    sql_lines.append("")
    return "\n".join(sql_lines) + "\n"

def build_schema_sql(include_data=True):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    header = f"""-- =====================================================================
-- СТО СПЕЦМАШ CRM — ПОЛНАЯ СХЕМА БАЗЫ ДАННЫХ И ДАННЫЕ (POSTGRESQL / SUPABASE)
-- Версия CRM: 1.2.3 (Актуальная версия со всеми обновлениями и модулями)
-- Дата экспорта: {now_str}
-- Инструкция: Запустите этот скрипт в Supabase SQL Editor или psql.
-- =====================================================================

-- Отключение внешних ключей на время массовой загрузки (при необходимости)
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

-- =====================================================================
-- 1. ТАБЛИЦА НАСТРОЕК (SETTINGS)
-- Хранит глобальные параметры, реквизиты компании, WhatsApp API и права доступа
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.settings (
    key text PRIMARY KEY,
    value text NOT NULL DEFAULT ''
);

-- =====================================================================
-- 2. ТАБЛИЦА СОТРУДНИКОВ (USERS)
-- Поддерживает 5 ролей: admin, moderator, manager, mechanic, sales_manager
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id integer PRIMARY KEY,
    username text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    salt text NOT NULL,
    full_name text NOT NULL,
    role text NOT NULL CHECK (role IN ('admin', 'moderator', 'manager', 'mechanic', 'sales_manager')),
    phone text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 3. ТАБЛИЦА КЛИЕНТОВ (CLIENTS)
-- База контрагентов: юрлица, физлица, контакты и реквизиты
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.clients (
    id integer PRIMARY KEY,
    name text NOT NULL,
    company text NOT NULL DEFAULT '',
    phone text NOT NULL DEFAULT '',
    email text NOT NULL DEFAULT '',
    address text NOT NULL DEFAULT '',
    notes text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 4. ТАБЛИЦА ТЕХНИКИ И ОБОРУДОВАНИЯ (EQUIPMENT)
-- Спецтехника, грузовые автомобили, тракторы, комбайны с привязкой к клиентам
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.equipment (
    id integer PRIMARY KEY,
    client_id integer REFERENCES public.clients(id) ON DELETE SET NULL,
    name text NOT NULL,
    category text NOT NULL DEFAULT 'Спецтехника',
    serial_vin text NOT NULL DEFAULT '',
    year integer,
    operating_hours text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'Исправна',
    notes text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 5. ТАБЛИЦА СКЛАДА И ЗАПЧАСТЕЙ (PARTS)
-- Номенклатура запчастей, артикулы SKU, цены закупки и продажи (AMD), остатки
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.parts (
    id integer PRIMARY KEY,
    sku text NOT NULL UNIQUE,
    name text NOT NULL,
    category text NOT NULL DEFAULT 'Запчасти',
    quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    min_threshold integer NOT NULL DEFAULT 2 CHECK (min_threshold >= 0),
    purchase_price numeric(14, 2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
    selling_price numeric(14, 2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
    location text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 6. ТАБЛИЦА СДЕЛОК И ЗАКАЗ-НАРЯДОВ (DEALS)
-- Поддерживает 3 направления (СТО, Запчасти, Отдел продаж) и 3 типа (Сервис, Предпродажка, Гарантия)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.deals (
    id integer PRIMARY KEY,
    title text NOT NULL,
    client_id integer REFERENCES public.clients(id) ON DELETE SET NULL,
    equipment_id integer REFERENCES public.equipment(id) ON DELETE SET NULL,
    stage text NOT NULL DEFAULT 'new',
    amount numeric(14, 2) NOT NULL DEFAULT 0,
    cost numeric(14, 2) NOT NULL DEFAULT 0,
    priority text NOT NULL DEFAULT 'normal',
    responsible text NOT NULL DEFAULT 'Мастер-приемщик',
    description text NOT NULL DEFAULT '',
    deadline text,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

-- =====================================================================
-- 7. ТАБЛИЦА СПИСАНИЯ ДЕТАЛЕЙ В ЗАКАЗ-НАРЯДЫ (DEAL_PARTS)
-- Связывает сделки и израсходованные со склада запчасти
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.deal_parts (
    id integer PRIMARY KEY,
    deal_id integer NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
    part_id integer NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
    quantity integer NOT NULL CHECK (quantity > 0),
    purchase_price numeric(14, 2) NOT NULL DEFAULT 0,
    selling_price numeric(14, 2) NOT NULL DEFAULT 0
);

-- =====================================================================
-- 8. ТАБЛИЦА ЗАДАЧ И НАПОМИНАНИЙ (TASKS)
-- Задачи планировщика, сроки, ответственные, привязка к клиентам и сделкам
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tasks (
    id integer PRIMARY KEY,
    title text NOT NULL,
    deal_id integer REFERENCES public.deals(id) ON DELETE SET NULL,
    client_id integer REFERENCES public.clients(id) ON DELETE SET NULL,
    due_date text NOT NULL DEFAULT '',
    priority text NOT NULL DEFAULT 'normal',
    status text NOT NULL DEFAULT 'pending',
    remind integer NOT NULL DEFAULT 1,
    notes text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 9. ТАБЛИЦА ДВИЖЕНИЯ ТОВАРА ПО СКЛАДУ (STOCK_MOVEMENTS)
-- Приходы, списания, аудиторский след остатков
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id integer PRIMARY KEY,
    part_id integer REFERENCES public.parts(id) ON DELETE SET NULL,
    type text NOT NULL CHECK (type IN ('incoming', 'outgoing')),
    quantity integer NOT NULL CHECK (quantity > 0),
    deal_id integer REFERENCES public.deals(id) ON DELETE SET NULL,
    comment text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 10. ТАБЛИЦА ЖУРНАЛА WHATSAPP РАССЫЛОК (WHATSAPP_LOGS)
-- История отправки маркетинговых сообщений через WhatsApp Cloud API
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_logs (
    id serial PRIMARY KEY,
    phone text NOT NULL,
    clean_phone text NOT NULL DEFAULT '',
    text text NOT NULL DEFAULT '',
    template text DEFAULT '',
    sent_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'pending',
    detail text NOT NULL DEFAULT ''
);

-- =====================================================================
-- ИНДЕКСЫ ДЛЯ ПОВЫШЕНИЯ ПРОИЗВОДИТЕЛЬНОСТИ
-- =====================================================================
CREATE INDEX IF NOT EXISTS equipment_client_id_idx ON public.equipment(client_id);
CREATE INDEX IF NOT EXISTS deals_client_id_idx ON public.deals(client_id);
CREATE INDEX IF NOT EXISTS deals_equipment_id_idx ON public.deals(equipment_id);
CREATE INDEX IF NOT EXISTS deals_stage_idx ON public.deals(stage);
CREATE INDEX IF NOT EXISTS deals_created_at_idx ON public.deals(created_at DESC);
CREATE INDEX IF NOT EXISTS deal_parts_deal_id_idx ON public.deal_parts(deal_id);
CREATE INDEX IF NOT EXISTS deal_parts_part_id_idx ON public.deal_parts(part_id);
CREATE INDEX IF NOT EXISTS tasks_client_id_idx ON public.tasks(client_id);
CREATE INDEX IF NOT EXISTS tasks_deal_id_idx ON public.tasks(deal_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);
CREATE INDEX IF NOT EXISTS stock_movements_part_id_idx ON public.stock_movements(part_id);
CREATE INDEX IF NOT EXISTS stock_movements_deal_id_idx ON public.stock_movements(deal_id);
CREATE INDEX IF NOT EXISTS parts_sku_idx ON public.parts(sku);
CREATE INDEX IF NOT EXISTS parts_category_idx ON public.parts(category);

-- =====================================================================
-- БЕЗОПАСНОСТЬ: ROW LEVEL SECURITY (RLS) И ПРАВА ДОСТУПА
-- =====================================================================
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;

-- Запрет прямого неавторизованного доступа из браузера
REVOKE ALL ON public.settings, public.users, public.clients, public.equipment,
    public.parts, public.deals, public.deal_parts, public.tasks, public.stock_movements, public.whatsapp_logs
    FROM anon, authenticated;

-- Полный доступ для служебного бэкенда (service_role)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON public.settings, public.users, public.clients, public.equipment,
    public.parts, public.deals, public.deal_parts, public.tasks, public.stock_movements, public.whatsapp_logs
    TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

"""

    if not include_data:
        return header

    print("Fetching live database records...")
    data_sections = ["\n-- =====================================================================",
                     "-- РАЗДЕЛ ВСТАВКИ ДАННЫХ (АКТУАЛЬНЫЙ СРЕЗ CRM БАЗЫ ДАННЫХ)",
                     "-- =====================================================================\n"]

    # 1. Settings
    settings_rows = fetch_all('settings', 'key')
    print(f"Loaded {len(settings_rows)} settings")
    data_sections.append(generate_inserts('settings', settings_rows, ['key', 'value'], conflict_col='key'))

    # 2. Users
    user_rows = fetch_all('users', 'id')
    print(f"Loaded {len(user_rows)} users")
    data_sections.append(generate_inserts('users', user_rows, 
        ['id', 'username', 'password_hash', 'salt', 'full_name', 'role', 'phone', 'created_at'], conflict_col='id'))

    # 3. Clients
    client_rows = fetch_all('clients', 'id')
    print(f"Loaded {len(client_rows)} clients")
    data_sections.append(generate_inserts('clients', client_rows,
        ['id', 'name', 'company', 'phone', 'email', 'address', 'notes', 'created_at'], conflict_col='id'))

    # 4. Equipment
    equipment_rows = fetch_all('equipment', 'id')
    print(f"Loaded {len(equipment_rows)} equipment")
    data_sections.append(generate_inserts('equipment', equipment_rows,
        ['id', 'client_id', 'name', 'category', 'serial_vin', 'year', 'operating_hours', 'status', 'notes', 'created_at'], conflict_col='id'))

    # 5. Parts
    parts_rows = fetch_all('parts', 'id')
    print(f"Loaded {len(parts_rows)} parts")
    data_sections.append(generate_inserts('parts', parts_rows,
        ['id', 'sku', 'name', 'category', 'quantity', 'min_threshold', 'purchase_price', 'selling_price', 'location', 'created_at'], conflict_col='id'))

    # 6. Deals
    deals_rows = fetch_all('deals', 'id')
    print(f"Loaded {len(deals_rows)} deals")
    data_sections.append(generate_inserts('deals', deals_rows,
        ['id', 'title', 'client_id', 'equipment_id', 'stage', 'amount', 'cost', 'priority', 'responsible', 'description', 'deadline', 'created_at', 'completed_at'], conflict_col='id'))

    # 7. Deal parts
    dp_rows = fetch_all('deal_parts', 'id')
    print(f"Loaded {len(dp_rows)} deal_parts")
    data_sections.append(generate_inserts('deal_parts', dp_rows,
        ['id', 'deal_id', 'part_id', 'quantity', 'purchase_price', 'selling_price'], conflict_col='id'))

    # 8. Tasks
    task_rows = fetch_all('tasks', 'id')
    print(f"Loaded {len(task_rows)} tasks")
    data_sections.append(generate_inserts('tasks', task_rows,
        ['id', 'title', 'deal_id', 'client_id', 'due_date', 'priority', 'status', 'remind', 'notes', 'created_at'], conflict_col='id'))

    # 9. Stock movements
    sm_rows = fetch_all('stock_movements', 'id')
    print(f"Loaded {len(sm_rows)} stock_movements")
    data_sections.append(generate_inserts('stock_movements', sm_rows,
        ['id', 'part_id', 'type', 'quantity', 'deal_id', 'comment', 'created_at'], conflict_col='id'))

    footer = f"""
-- =====================================================================
-- ИТОГОВАЯ ПРОВЕРКА И ЗАВЕРШЕНИЕ
-- =====================================================================
-- Скрипт успешно выполнен. База данных СТО Спецмаш v1.2.3 готова к работе!
"""
    data_sections.append(footer)
    return header + "\n".join(data_sections)

if __name__ == "__main__":
    print("Generating schema.sql with all current data...")
    full_sql = build_schema_sql(include_data=True)
    
    # Save to Downloads directory as requested by user
    downloads_path = r"c:\Users\079\Downloads\schema.sql"
    with open(downloads_path, "w", encoding="utf-8") as f:
        f.write(full_sql)
    print(f"Saved: {downloads_path} ({len(full_sql)} bytes, {len(full_sql.splitlines())} lines)")

    # Also save structure-only schema
    structure_sql = build_schema_sql(include_data=False)
    structure_path = r"c:\Users\079\Downloads\schema_structure_only.sql"
    with open(structure_path, "w", encoding="utf-8") as f:
        f.write(structure_sql)
    print(f"Saved: {structure_path} ({len(structure_sql)} bytes, {len(structure_sql.splitlines())} lines)")

    # Also save in local repo
    repo_path = r"C:\Users\079\.gemini\antigravity\scratch\tech-crm\schema.sql"
    with open(repo_path, "w", encoding="utf-8") as f:
        f.write(full_sql)
    print(f"Saved: {repo_path}")
