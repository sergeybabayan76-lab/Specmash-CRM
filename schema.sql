-- =====================================================================
-- СТО СПЕЦМАШ CRM — ПОЛНАЯ СХЕМА БАЗЫ ДАННЫХ И ДАННЫЕ (POSTGRESQL / SUPABASE)
-- Версия CRM: 1.2.3 (Актуальная версия со всеми обновлениями и модулями)
-- Дата экспорта: 2026-10-28 16:16:12
-- Инструкция: Запустите этот скрипт в Supabase SQL Editor или psql.
-- =====================================================================

-- Отключение внешних ключей на время массовой загрузки (при необходимости)
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

-- Версии применённых миграций схемы
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

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


-- =====================================================================
