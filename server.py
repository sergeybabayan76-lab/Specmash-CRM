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

# Подключаем статические файлы, если папка существует
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

class DealStageUpdate(BaseModel):
    stage: str

@app.get("/")
def read_root():
    # Если в папке static есть index.html, отдаем его как главный интерфейс CRM
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
        else:
            update_data["completed_at"] = None
        
        res = db.table("deals").update(update_data).eq("id", deal_id).execute()
        return {"message": "Статус сделки обновлен", "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
