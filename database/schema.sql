-- Run once in the SQL Editor of the new Supabase project.
-- The CRM server uses the service_role key; browser roles receive no table access.

create table if not exists public.settings (
    key text primary key,
    value text not null default ''
);

create table if not exists public.users (
    id integer primary key,
    username text not null unique,
    password_hash text not null,
    salt text not null,
    full_name text not null,
    role text not null check (role in ('admin', 'moderator', 'mechanic')),
    phone text not null default '',
    created_at timestamptz not null default now()
);

create table if not exists public.clients (
    id integer primary key,
    name text not null,
    company text not null default '',
    phone text not null default '',
    email text not null default '',
    address text not null default '',
    notes text not null default '',
    created_at timestamptz not null default now()
);

create table if not exists public.equipment (
    id integer primary key,
    client_id integer references public.clients(id) on delete set null,
    name text not null,
    category text not null default 'Спецтехника',
    serial_vin text not null default '',
    year integer,
    operating_hours text not null default '',
    status text not null default 'Исправна',
    notes text not null default '',
    created_at timestamptz not null default now()
);

create table if not exists public.parts (
    id integer primary key,
    sku text not null unique,
    name text not null,
    category text not null default 'Запчасти',
    quantity integer not null default 0 check (quantity >= 0),
    min_threshold integer not null default 2 check (min_threshold >= 0),
    purchase_price numeric(14, 2) not null default 0 check (purchase_price >= 0),
    selling_price numeric(14, 2) not null default 0 check (selling_price >= 0),
    location text not null default '',
    created_at timestamptz not null default now()
);

create table if not exists public.deals (
    id integer primary key,
    title text not null,
    client_id integer references public.clients(id) on delete set null,
    equipment_id integer references public.equipment(id) on delete set null,
    stage text not null default 'new',
    amount numeric(14, 2) not null default 0,
    cost numeric(14, 2) not null default 0,
    priority text not null default 'normal',
    responsible text not null default 'Мастер-приемщик',
    description text not null default '',
    deadline text,
    created_at timestamptz not null default now(),
    completed_at timestamptz
);

create table if not exists public.deal_parts (
    id integer primary key,
    deal_id integer not null references public.deals(id) on delete cascade,
    part_id integer not null references public.parts(id) on delete cascade,
    quantity integer not null check (quantity > 0),
    purchase_price numeric(14, 2) not null default 0,
    selling_price numeric(14, 2) not null default 0
);

create table if not exists public.tasks (
    id integer primary key,
    title text not null,
    deal_id integer references public.deals(id) on delete set null,
    client_id integer references public.clients(id) on delete set null,
    due_date text not null,
    priority text not null default 'normal',
    status text not null default 'pending',
    remind integer not null default 1,
    notes text not null default '',
    created_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
    id integer primary key,
    part_id integer references public.parts(id) on delete set null,
    type text not null check (type in ('incoming', 'outgoing')),
    quantity integer not null check (quantity > 0),
    deal_id integer references public.deals(id) on delete set null,
    comment text not null default '',
    created_at timestamptz not null default now()
);

create index if not exists equipment_client_id_idx on public.equipment(client_id);
create index if not exists deals_client_id_idx on public.deals(client_id);
create index if not exists deals_equipment_id_idx on public.deals(equipment_id);
create index if not exists deal_parts_deal_id_idx on public.deal_parts(deal_id);
create index if not exists deal_parts_part_id_idx on public.deal_parts(part_id);
create index if not exists tasks_client_id_idx on public.tasks(client_id);
create index if not exists tasks_deal_id_idx on public.tasks(deal_id);
create index if not exists stock_movements_part_id_idx on public.stock_movements(part_id);
create index if not exists stock_movements_deal_id_idx on public.stock_movements(deal_id);

alter table public.settings enable row level security;
alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.equipment enable row level security;
alter table public.parts enable row level security;
alter table public.deals enable row level security;
alter table public.deal_parts enable row level security;
alter table public.tasks enable row level security;
alter table public.stock_movements enable row level security;

revoke all on public.settings, public.users, public.clients, public.equipment,
    public.parts, public.deals, public.deal_parts, public.tasks, public.stock_movements
    from anon, authenticated;
grant usage on schema public to service_role;
grant all privileges on public.settings, public.users, public.clients, public.equipment,
    public.parts, public.deals, public.deal_parts, public.tasks, public.stock_movements
    to service_role;
