"""
Supabase database connection and helpers for СТО Спецмаш CRM.
"""

import os
from typing import List, Dict, Any, Optional
from supabase import create_client, Client

# Получаем настройки из переменных окружения Vercel
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY") # или SUPABASE_SERVICE_ROLE_KEY

def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("Не заданы переменные окружения SUPABASE_URL или SUPABASE_SECRET_KEY!")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def get_dashboard_metrics() -> Dict[str, Any]:
    """
    Пример получения метрик через клиент Supabase.
    """
    db = get_supabase()
    
    # Пример запроса к таблице deals
    deals_res = db.table("deals").select("*").execute()
    deals = deals_res.data if deals_res.data else []
    
    completed_deals = [d for d in deals if d.get("stage") == "completed"]
    total_revenue = sum(d.get("amount", 0) for d in completed_deals)
    total_cost = sum(d.get("cost", 0) for d in completed_deals)
    net_profit = total_revenue - total_cost
    
    clients_res = db.table("clients").select("id", count="exact").execute()
    equipment_res = db.table("equipment").select("id", count="exact").execute()
    users_res = db.table("users").select("id", count="exact").execute()
    
    return {
        "total_revenue": round(total_revenue, 2),
        "total_cost": round(total_cost, 2),
        "net_profit": round(net_profit, 2),
        "completed_count": len(completed_deals),
        "active_deals_count": len([d for d in deals if d.get("stage") not in ("completed", "cancelled")]),
        "total_clients": clients_res.count if clients_res.count is not None else 0,
        "total_equipment": equipment_res.count if equipment_res.count is not None else 0,
        "total_users": users_res.count if users_res.count is not None else 0,
        "recent_deals": deals[-5:] if deals else []
    }

def dump_all_data() -> Dict[str, Any]:
    db = get_supabase()
    data = {}
    for table in ["settings", "users", "clients", "equipment", "parts", "deals", "deal_parts", "tasks", "stock_movements"]:
        res = db.table(table).select("*").execute()
        data[table] = res.data if res.data else []
    return data
