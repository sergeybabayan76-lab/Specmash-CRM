"""
FastAPI Backend Server for СТО Спецмаш CRM with Supabase Backend.
"""

import os
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import database

app = FastAPI(title="СТО Спецмаш CRM API", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# ----------------- Pydantic Models -----------------

class DealStageUpdate(BaseModel):
    stage: str

class ClientCreate(BaseModel):
    name: str
    company: Optional[str] = ""
    phone: str
    email: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""

class EquipmentCreate(BaseModel):
    client_id: Optional[int] = None
    name: str
    category: str
    serial_vin: Optional[str] = ""
    year: Optional[int] = None
    operating_hours: Optional[str] = ""
    status: Optional[str] = "Исправна"
    notes: Optional[str] = ""

class DealCreate(BaseModel):
    title: str
    client_id: Optional[int] = None
    equipment_id: Optional[int] = None
    stage: str = "new"
    amount: float = 0.0
    cost: float = 0.0
    priority: str = "normal"
    responsible: str = "Мастер-приемщик"
    description: Optional[str] = ""
    deadline: Optional[str] = ""

class PartCreate(BaseModel):
    sku: Optional[str] = ""
    name: str
    category: Optional[str] = ""
    quantity: int = 0
    min_threshold: int = 2
    purchase_price: float = 0.0
    selling_price: float = 0.0
    location: Optional[str] = ""

# ----------------- Routes -----------------

@app.get("/")
def read_root():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"status": "online", "app": "СТО Спецмаш CRM API", "version": "1.2.0"}

@app.get("/api/settings")
def get_settings():
    db = database.get_supabase()
    if not db:
        return {"company_name": "СТО Спецмаш", "currency": "AMD"}
    try:
        res = db.table("settings").select("*").execute()
        return {r["key"]: r["value"] for r in (res.data or [])}
    except Exception:
        return {"company_name": "СТО Спецмаш", "currency": "AMD"}

@app.get("/api/dashboard")
def get_dashboard():
    return database.get_dashboard_metrics()

# Deals
@app.get("/api/deals")
def list_deals(stage: Optional[str] = None, q: Optional[str] = None):
    db = database.get_supabase()
    if not db:
        return []
    try:
        query = db.table("deals").select("*, clients(name, company, phone), equipment(name, serial_vin)")
        if stage and stage != "all":
            query = query.eq("stage", stage)
        res = query.execute()
        return res.data or []
    except Exception:
        return []

@app.post("/api/deals")
def create_deal(deal: DealCreate):
    db = database.get_supabase()
    if not db:
        raise HTTPException(status_code=500, detail="Нет подключения к базе данных")
    try:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        completed_at = now_str if deal.stage == "completed" else None
        
        deal_data = {
            "title": deal.title.strip(),
            "client_id": deal.client_id if deal.client_id and deal.client_id > 0 else None,
            "equipment_id": deal.equipment_id if deal.equipment_id and deal.equipment_id > 0 else None,
            "stage": deal.stage or "new",
            "amount": float(deal.amount or 0.0),
            "cost": float(deal.cost or 0.0),
            "priority": deal.priority or "normal",
            "responsible": deal.responsible or "Мастер-приемщик",
            "description": (deal.description or "").strip(),
            "deadline": deal.deadline or None,
            "created_at": now_str,
            "completed_at": completed_at
        }
        res = db.table("deals").insert(deal_data).execute()
        return {"message": "Сделка успешно создана", "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/deals/{deal_id}/stage")
@app.post("/api/deals/{deal_id}/stage")
def update_deal_stage(deal_id: int, update: DealStageUpdate):
    db = database.get_supabase()
    if not db:
        raise HTTPException(status_code=500, detail="Нет подключения к базе данных")
    try:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        update_data = {"stage": update.stage}
        if update.stage == "completed":
            update_data["completed_at"] = now_str
        else:
            update_data["completed_at"] = None
        
        res = db.table("deals").update(update_data).eq("id", deal_id).execute()
        return {"message": "Статус сделки обновлен", "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Clients
@app.get("/api/clients")
def list_clients(q: Optional[str] = None):
    db = database.get_supabase()
    if not db:
        return []
    try:
        res = db.table("clients").select("*").order("id", desc=True).execute()
        return res.data or []
    except Exception:
        return []

@app.post("/api/clients")
def create_client(client: ClientCreate):
    db = database.get_supabase()
    if not db:
        raise HTTPException(status_code=500, detail="Нет подключения к базе данных")
    try:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        client_data = {
            "name": client.name.strip(),
            "company": (client.company or "").strip(),
            "phone": client.phone.strip(),
            "email": (client.email or "").strip(),
            "address": (client.address or "").strip(),
            "notes": (client.notes or "").strip(),
            "created_at": now_str
        }
        res = db.table("clients").insert(client_data).execute()
        return {"message": "Клиент добавлен", "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Equipment
@app.get("/api/equipment")
def list_equipment(category: Optional[str] = None, q: Optional[str] = None):
    db = database.get_supabase()
    if not db:
        return []
    try:
        query = db.table("equipment").select("*, clients(name, company, phone)")
        if category and category != "all":
            query = query.eq("category", category)
        res = query.order("id", desc=True).execute()
        return res.data or []
    except Exception:
        return []

@app.post("/api/equipment")
def create_equipment(eq: EquipmentCreate):
    db = database.get_supabase()
    if not db:
        raise HTTPException(status_code=500, detail="Нет подключения к базе данных")
    try:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        eq_data = {
            "client_id": eq.client_id if eq.client_id and eq.client_id > 0 else None,
            "name": eq.name.strip(),
            "category": eq.category,
            "serial_vin": (eq.serial_vin or "").strip(),
            "year": eq.year,
            "operating_hours": (eq.operating_hours or "").strip(),
            "status": eq.status or "Исправна",
            "notes": (eq.notes or "").strip(),
            "created_at": now_str
        }
        res = db.table("equipment").insert(eq_data).execute()
        return {"message": "Техника зарегистрирована", "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Parts (Inventory)
@app.get("/api/parts")
def list_parts(low_stock: Optional[bool] = None, q: Optional[str] = None):
    db = database.get_supabase()
    if not db:
        return []
    try:
        res = db.table("parts").select("*").order("id", desc=True).execute()
        data = res.data or []
        if low_stock:
            data = [p for p in data if p.get("quantity", 0) <= p.get("min_threshold", 2)]
        return data
    except Exception:
        return []

@app.post("/api/parts")
def create_part(part: PartCreate):
    db = database.get_supabase()
    if not db:
        raise HTTPException(status_code=500, detail="Нет подключения к базе данных")
    try:
        part_data = {
            "sku": (part.sku or "").strip(),
            "name": part.name.strip(),
            "category": (part.category or "").strip(),
            "quantity": int(part.quantity or 0),
            "min_threshold": int(part.min_threshold or 2),
            "purchase_price": float(part.purchase_price or 0.0),
            "selling_price": float(part.selling_price or 0.0),
            "location": (part.location or "").strip()
        }
        res = db.table("parts").insert(part_data).execute()
        return {"message": "Запчасть добавлена", "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
