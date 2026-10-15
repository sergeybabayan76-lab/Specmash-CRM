"""
Supabase database adapter for СТО Спецмаш CRM.
"""

import os
from typing import List, Dict, Any, Optional
from supabase import create_client, Client

def get_supabase() -> Optional[Client]:
    url = os.environ.get("SUPABASE_URL")
    # Проверяем все возможные варианты названий ключа в Vercel
    key = (
        os.environ.get("SUPABASE_KEY") or 
        os.environ.get("SUPABASE_SECRET_KEY") or 
        os.environ.get("SUPABASE_ANON_KEY")
    )
    
    if not url or not key:
        return None
    try:
        return create_client(url, key)
    except Exception as e:
        print(f"Supabase connection error: {e}")
        return None

def get_dashboard_metrics() -> Dict[str, Any]:
    db = get_supabase()
    if not db:
        return {
            "total_revenue": 0, "total_cost": 0, "net_profit": 0, "margin_percent": 0,
            "completed_count": 0, "avg_deal": 0, "active_deals_count": 0, "total_deals_count": 0,
            "active_deals_volume": 0, "total_clients": 0, "total_equipment": 0, "total_users": 0,
            "low_stock_parts": 0, "inventory_cost": 0, "inventory_retail": 0, "overdue_tasks": 0,
            "deals_by_stage": {}, "recent_deals": []
        }

    try:
        deals_res = db.table("deals").select("*").execute()
        deals = deals_res.data if deals_res.data else []
        
        completed_deals = [d for d in deals if d.get("stage") == "completed"]
        total_revenue = sum(d.get("amount", 0) for d in completed_deals)
        total_cost = sum(d.get("cost", 0) for d in completed_deals)
        net_profit = total_revenue - total_cost
        
        clients_res = db.table("clients").select("id", count="exact").execute()
        equipment_res = db.table("equipment").select("id", count="exact").execute()
        
        # Безопасный запрос к таблице users (если её еще нет, не падаем)
        try:
            users_res = db.table("users").select("id", count="exact").execute()
            total_users = users_res.count if users_res.count is not None else 0
        except Exception:
            total_users = 0

        parts_res = db.table("parts").select("*").execute()
        parts = parts_res.data if parts_res.data else []
        
        low_stock = sum(1 for p in parts if p.get("quantity", 0) <= p.get("min_threshold", 2))
        inv_cost = sum(p.get("quantity", 0) * p.get("purchase_price", 0) for p in parts)
        inv_retail = sum(p.get("quantity", 0) * p.get("selling_price", 0) for p in parts)

        stages = {}
        for d in deals:
            st = d.get("stage", "new")
            if st not in stages:
                stages[st] = {"count": 0, "amount": 0}
            stages[st]["count"] += 1
            stages[st]["amount"] += d.get("amount", 0)

        return {
            "total_revenue": round(total_revenue, 2),
            "total_cost": round(total_cost, 2),
            "net_profit": round(net_profit, 2),
            "margin_percent": round((net_profit / total_revenue * 100), 1) if total_revenue > 0 else 0,
            "completed_count": len(completed_deals),
            "avg_deal": round(total_revenue / len(completed_deals), 2) if completed_deals else 0,
            "active_deals_count": len([d for d in deals if d.get("stage") not in ("completed", "cancelled")]),
            "total_deals_count": len(deals),
            "active_deals_volume": sum(d.get("amount", 0) for d in deals if d.get("stage") not in ("completed", "cancelled")),
            "total_clients": clients_res.count if clients_res.count is not None else len(clients_res.data or []),
            "total_equipment": equipment_res.count if equipment_res.count is not None else len(equipment_res.data or []),
            "total_users": total_users,
            "low_stock_parts": low_stock,
            "inventory_cost": round(inv_cost, 2),
            "inventory_retail": round(inv_retail, 2),
            "overdue_tasks": 0,
            "deals_by_stage": stages,
            "recent_deals": deals[-5:] if deals else []
        }
    except Exception as e:
        print(f"Error fetching metrics: {e}")
        return {}

def dump_all_data() -> Dict[str, Any]:
    db = get_supabase()
    data = {}
    if not db:
        return data
    for table in ["settings", "users", "clients", "equipment", "parts", "deals", "deal_parts", "tasks", "stock_movements"]:
        try:
            res = db.table(table).select("*").execute()
            data[table] = res.data if res.data else []
        except Exception:
            data[table] = []
    return data

def restore_all_data(data: Dict[str, Any]) -> Dict[str, Any]:
    return {"status": "ok"}
