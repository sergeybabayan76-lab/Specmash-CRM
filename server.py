"""
FastAPI Backend Server for СТО Спецмаш CRM.
Handles REST API for Users/Auth, Administrator Settings/Branding, Deals/Kanban & List views, Clients, Equipment, Warehouse, Tasks, Analytics, and CSV Import/Export.
"""

import os
import csv
import io
import json
import base64
import shutil
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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
UPLOADS_DIR = os.path.join(STATIC_DIR, "uploads")
try:
    os.makedirs(STATIC_DIR, exist_ok=True)
    os.makedirs(UPLOADS_DIR, exist_ok=True)
except Exception:
    pass

# ----------------- Pydantic Models -----------------

class LoginRequest(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str = "mechanic"
    phone: Optional[str] = ""

class UserUpdate(BaseModel):
    full_name: str
    role: str
    phone: Optional[str] = ""
    password: Optional[str] = None

class FullSettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    company_slogan: Optional[str] = None
    company_phone: Optional[str] = None
    company_email: Optional[str] = None
    company_address: Optional[str] = None
    company_tin: Optional[str] = None
    currency: Optional[str] = None
    default_responsible: Optional[str] = None
    warranty_months: Optional[str] = None
    logo_url: Optional[str] = None
    auth_icon: Optional[str] = "wrench"
    auth_logo_url: Optional[str] = None

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

class PartCreate(BaseModel):
    sku: str
    name: str
    category: str
    quantity: int = 0
    min_threshold: int = 2
    purchase_price: float = 0.0
    selling_price: float = 0.0
    location: Optional[str] = ""

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

class DealStageUpdate(BaseModel):
    stage: str

class TaskCreate(BaseModel):
    title: str
    deal_id: Optional[int] = None
    client_id: Optional[int] = None
    due_date: str
    priority: str = "normal"
    status: str = "pending"
    remind: int = 1
    notes: Optional[str] = ""

# ----------------- Base Routes & Stats -----------------

@app.get("/")
def read_root():
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
        
        res = db.table("deals").update(update_data).eq("id", deal_id).execute()
        return {"message": "Статус сделки обновлен", "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
