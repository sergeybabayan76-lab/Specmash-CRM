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

# Initialize database on startup
database.init_db()

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
    role: str = "mechanic"  # 'admin', 'moderator', 'mechanic'
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

class PartStockAdjust(BaseModel):
    quantity_change: int
    comment: Optional[str] = "Корректировка остатка"

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

class DealAttachPart(BaseModel):
    part_id: int
    quantity: int = 1

class TaskCreate(BaseModel):
    title: str
    deal_id: Optional[int] = None
    client_id: Optional[int] = None
    due_date: str
    priority: str = "normal"
    status: str = "pending"
    remind: int = 1
    notes: Optional[str] = ""

# ----------------- Auth & Users -----------------

@app.post("/api/auth/login")
def login(req: LoginRequest):
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE LOWER(username) = ?", (req.username.strip().lower(),))
    user = c.fetchone()
    conn.close()

    if not user:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    if not database.verify_password(req.password, user["password_hash"], user["salt"]):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    return {
        "id": user["id"],
        "username": user["username"],
        "full_name": user["full_name"],
        "role": user["role"],
        "phone": user["phone"] or "",
    }

@app.get("/api/users")
def list_users():
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("SELECT id, username, full_name, role, phone, created_at FROM users ORDER BY id ASC")
    users = [dict(r) for r in c.fetchall()]
    conn.close()
    return users

@app.post("/api/users")
def create_user(u: UserCreate):
    valid_roles = ["admin", "moderator", "mechanic"]
    if u.role not in valid_roles:
        raise HTTPException(status_code=400, detail="Недопустимая роль. Доступны: admin, moderator, mechanic")

    clean_username = u.username.strip().lower()
    if len(clean_username) < 3 or clean_username in ('undefined', 'null'):
        raise HTTPException(status_code=400, detail="Логин сотрудника должен быть не короче 3 символов и не содержать 'undefined'")
    if len(u.password) < 4:
        raise HTTPException(status_code=400, detail="Пароль должен быть не короче 4 символов")

    conn = database.get_connection()
    c = conn.cursor()
    c.execute("SELECT id FROM users WHERE LOWER(username) = ?", (clean_username,))
    existing = c.fetchone()
    p_hash, salt = database.hash_password(u.password)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if existing:
        user_id = existing["id"]
        c.execute("""
            UPDATE users SET password_hash = ?, salt = ?, full_name = ?, role = ?, phone = ?
            WHERE id = ?
        """, (p_hash, salt, u.full_name.strip(), u.role, (u.phone or "").strip(), user_id))
        conn.commit()
        conn.close()
        return {
            "id": user_id,
            "username": clean_username,
            "full_name": u.full_name.strip(),
            "role": u.role,
            "phone": (u.phone or "").strip(),
            "created_at": now_str,
            "message": "Сотрудник успешно обновлен"
        }

    c.execute("""
        INSERT INTO users (username, password_hash, salt, full_name, role, phone, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (clean_username, p_hash, salt, u.full_name.strip(), u.role, (u.phone or "").strip(), now_str))
    user_id = c.lastrowid
    conn.commit()
    conn.close()
    return {
        "id": user_id,
        "username": clean_username,
        "full_name": u.full_name.strip(),
        "role": u.role,
        "phone": (u.phone or "").strip(),
        "created_at": now_str,
        "message": "Сотрудник успешно добавлен"
    }

@app.put("/api/users/{user_id}")
@app.post("/api/users/{user_id}")
def update_user(user_id: int, u: UserUpdate):
    valid_roles = ["admin", "moderator", "mechanic"]
    if u.role not in valid_roles:
        raise HTTPException(status_code=400, detail="Недопустимая роль")

    conn = database.get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    existing = c.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    if existing["role"] == "admin" and u.role != "admin":
        c.execute("SELECT COUNT(*) FROM users WHERE role = 'admin' AND id != ?", (user_id,))
        if c.fetchone()[0] == 0:
            conn.close()
            raise HTTPException(status_code=400, detail="В системе должен оставаться хотя бы один администратор!")

    clean_phone = (u.phone or "").strip()
    clean_fullname = u.full_name.strip()

    if u.password and len(u.password.strip()) > 0:
        if len(u.password.strip()) < 4:
            conn.close()
            raise HTTPException(status_code=400, detail="Пароль должен быть не короче 4 символов")
        p_hash, salt = database.hash_password(u.password.strip())
        c.execute("""
            UPDATE users SET full_name = ?, role = ?, phone = ?, password_hash = ?, salt = ?
            WHERE id = ?
        """, (clean_fullname, u.role, clean_phone, p_hash, salt, user_id))
    else:
        c.execute("""
            UPDATE users SET full_name = ?, role = ?, phone = ?
            WHERE id = ?
        """, (clean_fullname, u.role, clean_phone, user_id))

    conn.commit()
    conn.close()
    return {
        "id": user_id,
        "username": existing["username"],
        "full_name": clean_fullname,
        "role": u.role,
        "phone": clean_phone,
        "message": "Данные сотрудника обновлены"
    }

@app.delete("/api/users/{user_id}")
@app.post("/api/users/{user_id}/delete")
def delete_user(user_id: str):
    conn = database.get_connection()
    c = conn.cursor()

    # Automatically clean up any corrupted or undefined users
    c.execute("DELETE FROM users WHERE username IS NULL OR username = '' OR LOWER(username) IN ('undefined', 'null')")

    if user_id in ('undefined', 'null', '0'):
        conn.commit()
        conn.close()
        return {"message": "Некорректный сотрудник удален"}

    try:
        numeric_id = int(user_id)
        c.execute("SELECT role FROM users WHERE id = ?", (numeric_id,))
    except ValueError:
        numeric_id = None
        c.execute("SELECT role FROM users WHERE LOWER(username) = ?", (user_id.lower(),))

    row = c.fetchone()
    if not row:
        conn.commit()
        conn.close()
        return {"message": "Сотрудник уже удален"}

    if row["role"] == "admin":
        c.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        if c.fetchone()[0] <= 1:
            conn.close()
            raise HTTPException(status_code=400, detail="Нельзя удалить последнего администратора системы!")

    if numeric_id is not None:
        c.execute("DELETE FROM users WHERE id = ?", (numeric_id,))
    else:
        c.execute("DELETE FROM users WHERE LOWER(username) = ?", (user_id.lower(),))

    conn.commit()
    conn.close()
    return {"message": "Сотрудник успешно удален"}

# ----------------- Settings & Branding & Backup -----------------

@app.get("/api/settings")
def get_settings():
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("SELECT key, value FROM settings")
    settings_dict = {r["key"]: r["value"] for r in c.fetchall()}
    conn.close()

    defaults = {
        "company_name": "СТО Спецмаш",
        "company_slogan": "Сервис спецтехники, грузовых авто и оборудования",
        "company_phone": "+374 99 999999",
        "company_email": "info@specmash-sto.am",
        "company_address": "г. Ереван, ул. Себастия, 12",
        "company_tin": "02589412",
        "currency": "AMD",
        "default_responsible": "Иванов Алексей Викторович (Директор)",
        "warranty_months": "6",
        "logo_url": "",
        "auth_icon": "wrench",
        "auth_logo_url": "",
    }
    for k, v in defaults.items():
        if k not in settings_dict:
            settings_dict[k] = v
    return settings_dict

@app.post("/api/settings")
def update_settings(s: FullSettingsUpdate):
    conn = database.get_connection()
    c = conn.cursor()
    update_data = s.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value).strip()))
    conn.commit()
    conn.close()
    return {"message": "Основные настройки программы успешно сохранены"}

@app.get("/api/settings/stats")
def get_system_stats():
    conn = database.get_connection()
    c = conn.cursor()
    db_size_kb = 0
    if os.path.exists(database.DB_PATH):
        db_size_kb = round(os.path.getsize(database.DB_PATH) / 1024, 1)

    c.execute("SELECT COUNT(*) FROM clients")
    cnt_clients = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM equipment")
    cnt_eq = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM parts")
    cnt_parts = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM deals")
    cnt_deals = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM users")
    cnt_users = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM tasks")
    cnt_tasks = c.fetchone()[0]
    conn.close()

    return {
        "version": "1.2.0",
        "db_size_kb": db_size_kb,
        "counts": {
            "clients": cnt_clients,
            "equipment": cnt_eq,
            "parts": cnt_parts,
            "deals": cnt_deals,
            "users": cnt_users,
            "tasks": cnt_tasks,
        }
    }

@app.get("/api/settings/backup")
def download_database_backup():
    if not os.path.exists(database.DB_PATH):
        raise HTTPException(status_code=404, detail="Файл базы данных не найден")
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"specmash_crm_backup_{timestamp}.db"
    return FileResponse(
        database.DB_PATH,
        media_type="application/octet-stream",
        filename=filename
    )

@app.get("/api/backup/json")
def export_json_backup():
    """Exports full database state (all tables) as a clean JSON document."""
    try:
        data = database.dump_all_data()
        data["exported_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        data["app"] = "СТО Спецмаш CRM"
        data["version"] = "1.2.0"
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка экспорта базы: {str(e)}")

@app.post("/api/backup/restore")
async def restore_json_backup(req: Dict[str, Any]):
    """Restores full database state from JSON."""
    try:
        counts = database.restore_all_data(req)
        return {
            "message": "База данных успешно восстановлена",
            "restored_counts": counts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка восстановления базы: {str(e)}")

@app.post("/api/sync/hydrate")
def sync_hydrate_records(payload: Dict[str, Any]):
    """Syncs client-side persisted records to ensure Vercel serverless has all rows."""
    try:
        counts = database.restore_all_data(payload)
        return {"status": "ok", "synced": counts}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/settings/logo")
async def upload_logo(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".png", ".jpg", ".jpeg", ".svg", ".webp"]:
        raise HTTPException(status_code=400, detail="Поддерживаются только форматы PNG, JPG, JPEG, SVG, WebP")

    filename = f"logo{ext}"
    target_path = os.path.join(UPLOADS_DIR, filename)

    contents = await file.read()
    try:
        with open(target_path, "wb") as f:
            f.write(contents)
        logo_url = f"/static/uploads/{filename}?t={int(datetime.now().timestamp())}"
    except (OSError, IOError):
        mime_types = {
            ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".svg": "image/svg+xml", ".webp": "image/webp"
        }
        mime = mime_types.get(ext, "image/png")
        b64 = base64.b64encode(contents).decode("utf-8")
        logo_url = f"data:{mime};base64,{b64}"

    conn = database.get_connection()
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('logo_url', ?)", (logo_url,))
    conn.commit()
    conn.close()

    return {"logo_url": logo_url, "message": "Логотип успешно обновлен"}

@app.delete("/api/settings/logo")
def delete_logo():
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('logo_url', '')")
    conn.commit()
    conn.close()
    return {"message": "Логотип сброшен к стандартному"}

# ----------------- Dashboard & Analytics -----------------

@app.get("/api/dashboard")
def get_dashboard():
    metrics = database.get_dashboard_metrics()
    
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT 
            strftime('%Y-%m', completed_at) as month,
            SUM(amount) as revenue,
            SUM(cost) as cost,
            COUNT(*) as deals_count
        FROM deals 
        WHERE stage = 'completed' AND completed_at IS NOT NULL
        GROUP BY month
        ORDER BY month ASC
    """)
    monthly_data = [dict(r) for r in c.fetchall()]

    c.execute("""
        SELECT 
            c.id, c.name, c.company,
            COUNT(d.id) as completed_deals,
            COALESCE(SUM(d.amount), 0) as total_spent
        FROM clients c
        JOIN deals d ON d.client_id = c.id
        WHERE d.stage = 'completed'
        GROUP BY c.id
        ORDER BY total_spent DESC
        LIMIT 5
    """)
    top_clients = [dict(r) for r in c.fetchall()]

    c.execute("""
        SELECT id, sku, name, category, quantity, min_threshold, location
        FROM parts
        WHERE quantity <= min_threshold
        ORDER BY quantity ASC
        LIMIT 10
    """)
    critical_parts = [dict(r) for r in c.fetchall()]

    conn.close()

    metrics["monthly_data"] = monthly_data
    metrics["top_clients"] = top_clients
    metrics["critical_parts"] = critical_parts
    return metrics

# ----------------- Clients -----------------

@app.get("/api/clients")
def list_clients(q: Optional[str] = None):
    conn = database.get_connection()
    c = conn.cursor()
    query = """
        SELECT c.*, 
            (SELECT COUNT(*) FROM equipment WHERE client_id = c.id) as equipment_count,
            (SELECT COUNT(*) FROM deals WHERE client_id = c.id) as deals_count,
            (SELECT COALESCE(SUM(amount), 0) FROM deals WHERE client_id = c.id AND stage = 'completed') as total_revenue
        FROM clients c
    """
    params = []
    if q:
        query += " WHERE c.name LIKE ? OR c.company LIKE ? OR c.phone LIKE ? OR c.email LIKE ?"
        term = f"%{q}%"
        params = [term, term, term, term]
    query += " ORDER BY c.id DESC"
    
    c.execute(query, params)
    clients = [dict(r) for r in c.fetchall()]
    conn.close()
    return clients

@app.post("/api/clients")
def create_client(client: ClientCreate):
    conn = database.get_connection()
    c = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute("""
        INSERT INTO clients (name, company, phone, email, address, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (client.name, client.company, client.phone, client.email, client.address, client.notes, now_str))
    client_id = c.lastrowid
    conn.commit()
    conn.close()
    return {"id": client_id, "message": "Клиент успешно добавлен"}

@app.get("/api/clients/{client_id}")
def get_client(client_id: int):
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM clients WHERE id = ?", (client_id,))
    client_row = c.fetchone()
    if not client_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Клиент не найден")
    client = dict(client_row)

    c.execute("SELECT * FROM equipment WHERE client_id = ? ORDER BY id DESC", (client_id,))
    client["equipment"] = [dict(r) for r in c.fetchall()]

    c.execute("""
        SELECT d.*, eq.name as equipment_name 
        FROM deals d 
        LEFT JOIN equipment eq ON d.equipment_id = eq.id
        WHERE d.client_id = ? 
        ORDER BY d.id DESC
    """, (client_id,))
    client["deals"] = [dict(r) for r in c.fetchall()]

    c.execute("SELECT * FROM tasks WHERE client_id = ? ORDER BY due_date ASC", (client_id,))
    client["tasks"] = [dict(r) for r in c.fetchall()]

    conn.close()
    return client

@app.put("/api/clients/{client_id}")
@app.post("/api/clients/{client_id}")
def update_client(client_id: int, client: ClientCreate):
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("""
        UPDATE clients 
        SET name = ?, company = ?, phone = ?, email = ?, address = ?, notes = ?
        WHERE id = ?
    """, (client.name, client.company, client.phone, client.email, client.address, client.notes, client_id))
    if c.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Клиент не найден")
    conn.commit()
    conn.close()
    return {"message": "Данные клиента обновлены"}

@app.delete("/api/clients/{client_id}")
def delete_client(client_id: int):
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM clients WHERE id = ?", (client_id,))
    conn.commit()
    conn.close()
    return {"message": "Клиент удален"}

# ----------------- Equipment (База техники) -----------------

@app.get("/api/equipment")
def list_equipment(q: Optional[str] = None, category: Optional[str] = None):
    conn = database.get_connection()
    c = conn.cursor()
    query = """
        SELECT eq.*, c.name as client_name, c.company as client_company, c.phone as client_phone
        FROM equipment eq
        LEFT JOIN clients c ON eq.client_id = c.id
        WHERE 1=1
    """
    params = []
    if q:
        query += " AND (eq.name LIKE ? OR eq.serial_vin LIKE ? OR c.name LIKE ? OR c.company LIKE ?)"
        term = f"%{q}%"
        params.extend([term, term, term, term])
    if category and category != "all":
        query += " AND eq.category = ?"
        params.append(category)
    query += " ORDER BY eq.id DESC"
    
    c.execute(query, params)
    equipment = [dict(r) for r in c.fetchall()]
    conn.close()
    return equipment

@app.post("/api/equipment")
def create_equipment(eq: EquipmentCreate):
    conn = database.get_connection()
    c = conn.cursor()
    
    # Check client_id
    client_id = eq.client_id
    if client_id and client_id > 0:
        c.execute("SELECT id FROM clients WHERE id = ?", (client_id,))
        if not c.fetchone():
            client_id = None
    else:
        client_id = None

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute("""
        INSERT INTO equipment (client_id, name, category, serial_vin, year, operating_hours, status, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (client_id, eq.name.strip(), eq.category, (eq.serial_vin or "").strip(), eq.year, (eq.operating_hours or "").strip(), eq.status or "Исправна", (eq.notes or "").strip(), now_str))
    eq_id = c.lastrowid
    conn.commit()
    conn.close()
    return {
        "id": eq_id,
        "client_id": client_id,
        "name": eq.name.strip(),
        "category": eq.category,
        "serial_vin": (eq.serial_vin or "").strip(),
        "year": eq.year,
        "operating_hours": (eq.operating_hours or "").strip(),
        "status": eq.status or "Исправна",
        "notes": (eq.notes or "").strip(),
        "created_at": now_str,
        "message": "Единица техники успешно зарегистрирована"
    }

@app.get("/api/equipment/{eq_id}")
def get_equipment_detail(eq_id: int):
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT eq.*, c.name as client_name, c.company as client_company, c.phone as client_phone
        FROM equipment eq
        LEFT JOIN clients c ON eq.client_id = c.id
        WHERE eq.id = ?
    """, (eq_id,))
    eq_row = c.fetchone()
    if not eq_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Техника не найдена")
    item = dict(eq_row)

    c.execute("""
        SELECT * FROM deals WHERE equipment_id = ? ORDER BY id DESC
    """, (eq_id,))
    item["deals_history"] = [dict(r) for r in c.fetchall()]
    conn.close()
    return item

@app.put("/api/equipment/{eq_id}")
@app.post("/api/equipment/{eq_id}")
def update_equipment(eq_id: int, eq: EquipmentCreate):
    conn = database.get_connection()
    c = conn.cursor()

    client_id = eq.client_id
    if client_id and client_id > 0:
        c.execute("SELECT id FROM clients WHERE id = ?", (client_id,))
        if not c.fetchone():
            client_id = None
    else:
        client_id = None

    c.execute("""
        UPDATE equipment 
        SET client_id = ?, name = ?, category = ?, serial_vin = ?, year = ?, operating_hours = ?, status = ?, notes = ?
        WHERE id = ?
    """, (client_id, eq.name.strip(), eq.category, (eq.serial_vin or "").strip(), eq.year, (eq.operating_hours or "").strip(), eq.status or "Исправна", (eq.notes or "").strip(), eq_id))
    if c.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Техника не найдена")
    conn.commit()
    conn.close()
    return {
        "id": eq_id,
        "client_id": client_id,
        "name": eq.name.strip(),
        "category": eq.category,
        "serial_vin": (eq.serial_vin or "").strip(),
        "year": eq.year,
        "operating_hours": (eq.operating_hours or "").strip(),
        "status": eq.status or "Исправна",
        "notes": (eq.notes or "").strip(),
        "message": "Данные по технике обновлены"
    }

@app.delete("/api/equipment/{eq_id}")
def delete_equipment(eq_id: int):
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM equipment WHERE id = ?", (eq_id,))
    conn.commit()
    conn.close()
    return {"message": "Техника удалена"}

# ----------------- Deals / Kanban & List Pipeline -----------------

@app.get("/api/deals")
def list_deals(stage: Optional[str] = None, q: Optional[str] = None):
    conn = database.get_connection()
    c = conn.cursor()
    query = """
        SELECT d.*, 
            c.name as client_name, c.company as client_company, c.phone as client_phone,
            eq.name as equipment_name, eq.serial_vin as equipment_vin,
            (SELECT COALESCE(SUM(quantity), 0) FROM deal_parts WHERE deal_id = d.id) as parts_count
        FROM deals d
        LEFT JOIN clients c ON d.client_id = c.id
        LEFT JOIN equipment eq ON d.equipment_id = eq.id
        WHERE 1=1
    """
    params = []
    if stage and stage != "all":
        query += " AND d.stage = ?"
        params.append(stage)
    if q:
        query += " AND (d.title LIKE ? OR c.name LIKE ? OR c.company LIKE ? OR eq.name LIKE ? OR d.responsible LIKE ?)"
        term = f"%{q}%"
        params.extend([term, term, term, term, term])
    query += " ORDER BY d.id DESC"

    c.execute(query, params)
    deals = [dict(r) for r in c.fetchall()]
    conn.close()
    return deals

@app.post("/api/deals")
def create_deal(deal: DealCreate):
    conn = database.get_connection()
    c = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Validate client_id
    client_id = deal.client_id
    if client_id and client_id > 0:
        c.execute("SELECT id FROM clients WHERE id = ?", (client_id,))
        if not c.fetchone():
            c.execute("""
                INSERT OR IGNORE INTO clients (id, name, company, phone, created_at)
                VALUES (?, ?, '', '+37499999999', ?)
            """, (client_id, f"Клиент #{client_id}", now_str))
    else:
        client_id = None

    # Validate equipment_id: never wipe out equipment_id
    equipment_id = deal.equipment_id
    if equipment_id and equipment_id > 0:
        c.execute("SELECT id FROM equipment WHERE id = ?", (equipment_id,))
        if not c.fetchone():
            c.execute("""
                INSERT OR IGNORE INTO equipment (id, name, category, status, created_at)
                VALUES (?, ?, 'Спецтехника', 'В ремонте', ?)
            """, (equipment_id, f"Техника #{equipment_id}", now_str))
    else:
        equipment_id = None

    completed_at = now_str if deal.stage == "completed" else None
    c.execute("""
        INSERT INTO deals (title, client_id, equipment_id, stage, amount, cost, priority, responsible, description, deadline, created_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (deal.title.strip(), client_id, equipment_id, deal.stage, deal.amount or 0.0, deal.cost or 0.0, deal.priority or "normal", deal.responsible or "Мастер-приемщик", (deal.description or "").strip(), deal.deadline or None, now_str, completed_at))
    deal_id = c.lastrowid

    # Retrieve equipment details and client details for robust frontend sync
    eq_name = ""
    eq_vin = ""
    if equipment_id:
        c.execute("SELECT name, serial_vin FROM equipment WHERE id = ?", (equipment_id,))
        eq_row = c.fetchone()
        if eq_row:
            eq_name = eq_row["name"]
            eq_vin = eq_row["serial_vin"]

    cl_name = ""
    cl_phone = ""
    cl_comp = ""
    if client_id:
        c.execute("SELECT name, company, phone FROM clients WHERE id = ?", (client_id,))
        cl_row = c.fetchone()
        if cl_row:
            cl_name = cl_row["name"]
            cl_comp = cl_row["company"]
            cl_phone = cl_row["phone"]

    conn.commit()
    conn.close()
    return {
        "id": deal_id,
        "title": deal.title.strip(),
        "client_id": client_id,
        "client_name": cl_name,
        "client_company": cl_comp,
        "client_phone": cl_phone,
        "equipment_id": equipment_id,
        "equipment_name": eq_name,
        "equipment_vin": eq_vin,
        "stage": deal.stage,
        "amount": deal.amount or 0.0,
        "cost": deal.cost or 0.0,
        "parts_count": 0,
        "priority": deal.priority or "normal",
        "responsible": deal.responsible or "Мастер-приемщик",
        "description": (deal.description or "").strip(),
        "deadline": deal.deadline or None,
        "created_at": now_str,
        "completed_at": completed_at,
        "message": "Сделка/наряд успешно создан"
    }

@app.get("/api/deals/{deal_id}")
def get_deal(deal_id: int):
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT d.*, 
            c.name as client_name, c.company as client_company, c.phone as client_phone, c.email as client_email,
            eq.name as equipment_name, eq.serial_vin as equipment_vin, eq.operating_hours as equipment_hours
        FROM deals d
        LEFT JOIN clients c ON d.client_id = c.id
        LEFT JOIN equipment eq ON d.equipment_id = eq.id
        WHERE d.id = ?
    """, (deal_id,))
    deal_row = c.fetchone()
    if not deal_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Сделка не найдена")
    deal = dict(deal_row)

    c.execute("""
        SELECT dp.id as deal_part_id, dp.quantity, dp.purchase_price, dp.selling_price,
               dp.part_id as part_id,
               COALESCE(p.sku, 'P-' || dp.part_id) as sku,
               COALESCE(p.name, 'Запчасть #' || dp.part_id) as part_name,
               COALESCE(p.category, 'Запчасти') as part_category
        FROM deal_parts dp
        LEFT JOIN parts p ON dp.part_id = p.id
        WHERE dp.deal_id = ?
        ORDER BY dp.id ASC
    """, (deal_id,))
    deal["parts"] = [dict(r) for r in c.fetchall()]
    deal["parts_count"] = sum(p["quantity"] for p in deal["parts"])

    conn.close()
    return deal

@app.patch("/api/deals/{deal_id}/stage")
@app.post("/api/deals/{deal_id}/stage")
@app.put("/api/deals/{deal_id}/stage")
def update_deal_stage(deal_id: int, update: DealStageUpdate):
    conn = database.get_connection()
    c = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    completed_at = now_str if update.stage == "completed" else None

    if update.stage == "completed":
        c.execute("UPDATE deals SET stage = ?, completed_at = ? WHERE id = ?", (update.stage, completed_at, deal_id))
    else:
        c.execute("UPDATE deals SET stage = ?, completed_at = NULL WHERE id = ?", (update.stage, deal_id))

    if c.rowcount == 0:
        c.execute("SELECT id FROM deals WHERE id = ?", (deal_id,))
        if not c.fetchone():
            c.execute("""
                INSERT INTO deals (id, title, stage, amount, cost, priority, responsible, created_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (deal_id, f"Наряд #{deal_id}", update.stage, 0.0, 0.0, "normal", "Мастер-приемщик", now_str, completed_at))
    conn.commit()
    conn.close()
    return {"message": "Статус наряда успешно изменен", "stage": update.stage}

@app.put("/api/deals/{deal_id}")
@app.post("/api/deals/{deal_id}")
def update_deal(deal_id: int, deal: DealCreate):
    conn = database.get_connection()
    c = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    client_id = deal.client_id
    if client_id and client_id > 0:
        c.execute("SELECT id FROM clients WHERE id = ?", (client_id,))
        if not c.fetchone():
            c.execute("""
                INSERT OR IGNORE INTO clients (id, name, company, phone, created_at)
                VALUES (?, ?, '', '+37499999999', ?)
            """, (client_id, f"Клиент #{client_id}", now_str))
    else:
        client_id = None

    equipment_id = deal.equipment_id
    if equipment_id and equipment_id > 0:
        c.execute("SELECT id FROM equipment WHERE id = ?", (equipment_id,))
        if not c.fetchone():
            c.execute("""
                INSERT OR IGNORE INTO equipment (id, name, category, status, created_at)
                VALUES (?, ?, 'Спецтехника', 'В ремонте', ?)
            """, (equipment_id, f"Техника #{equipment_id}", now_str))
    else:
        equipment_id = None

    completed_at = now_str if deal.stage == "completed" else None
    c.execute("""
        UPDATE deals 
        SET title = ?, client_id = ?, equipment_id = ?, stage = ?, amount = ?, cost = ?, priority = ?, responsible = ?, description = ?, deadline = ?, completed_at = ?
        WHERE id = ?
    """, (deal.title.strip(), client_id, equipment_id, deal.stage, deal.amount or 0.0, deal.cost or 0.0, deal.priority or "normal", deal.responsible or "Мастер-приемщик", (deal.description or "").strip(), deal.deadline or None, completed_at, deal_id))
    if c.rowcount == 0:
        c.execute("""
            INSERT INTO deals (id, title, client_id, equipment_id, stage, amount, cost, priority, responsible, description, deadline, created_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (deal_id, deal.title.strip(), client_id, equipment_id, deal.stage, deal.amount or 0.0, deal.cost or 0.0, deal.priority or "normal", deal.responsible or "Мастер-приемщик", (deal.description or "").strip(), deal.deadline or None, now_str, completed_at))

    eq_name = ""
    eq_vin = ""
    if equipment_id:
        c.execute("SELECT name, serial_vin FROM equipment WHERE id = ?", (equipment_id,))
        eq_row = c.fetchone()
        if eq_row:
            eq_name = eq_row["name"]
            eq_vin = eq_row["serial_vin"]

    cl_name = ""
    cl_phone = ""
    cl_comp = ""
    if client_id:
        c.execute("SELECT name, company, phone FROM clients WHERE id = ?", (client_id,))
        cl_row = c.fetchone()
        if cl_row:
            cl_name = cl_row["name"]
            cl_comp = cl_row["company"]
            cl_phone = cl_row["phone"]

    c.execute("SELECT COALESCE(SUM(quantity), 0) FROM deal_parts WHERE deal_id = ?", (deal_id,))
    parts_count = c.fetchone()[0]

    conn.commit()
    conn.close()
    return {
        "id": deal_id,
        "title": deal.title.strip(),
        "client_id": client_id,
        "client_name": cl_name,
        "client_company": cl_comp,
        "client_phone": cl_phone,
        "equipment_id": equipment_id,
        "equipment_name": eq_name,
        "equipment_vin": eq_vin,
        "stage": deal.stage,
        "amount": deal.amount or 0.0,
        "cost": deal.cost or 0.0,
        "parts_count": parts_count,
        "priority": deal.priority or "normal",
        "responsible": deal.responsible or "Мастер-приемщик",
        "description": (deal.description or "").strip(),
        "deadline": deal.deadline or None,
        "completed_at": completed_at,
        "message": "Сделка обновлена"
    }

@app.delete("/api/deals/{deal_id}")
def delete_deal(deal_id: int):
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM deals WHERE id = ?", (deal_id,))
    conn.commit()
    conn.close()
    return {"message": "Сделка удалена"}

@app.post("/api/deals/{deal_id}/parts")
def attach_part_to_deal(deal_id: int, item: DealAttachPart):
    conn = database.get_connection()
    c = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Ensure deal exists in container SQLite
    c.execute("SELECT id FROM deals WHERE id = ?", (deal_id,))
    if not c.fetchone():
        c.execute("""
            INSERT OR IGNORE INTO deals (id, title, stage, amount, cost, priority, responsible, created_at)
            VALUES (?, ?, 'in_progress', 0.0, 0.0, 'normal', 'Мастер-приемщик', ?)
        """, (deal_id, f"Наряд #{deal_id}", now_str))
    
    c.execute("SELECT id, name, quantity, purchase_price, selling_price FROM parts WHERE id = ?", (item.part_id,))
    part = c.fetchone()
    if not part:
        # Recover stub part if not yet hydrated on this Lambda container
        c.execute("""
            INSERT OR IGNORE INTO parts (id, sku, name, category, quantity, min_threshold, purchase_price, selling_price, created_at)
            VALUES (?, ?, ?, 'Запчасти', 10, 2, 0.0, 0.0, ?)
        """, (item.part_id, f"P-{item.part_id}", f"Запчасть #{item.part_id}", now_str))
        c.execute("SELECT id, name, quantity, purchase_price, selling_price FROM parts WHERE id = ?", (item.part_id,))
        part = c.fetchone()

    if part["quantity"] < item.quantity:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Недостаточно остатка на складе! В наличии: {part['quantity']} шт.")

    c.execute("""
        INSERT INTO deal_parts (deal_id, part_id, quantity, purchase_price, selling_price)
        VALUES (?, ?, ?, ?, ?)
    """, (deal_id, item.part_id, item.quantity, part["purchase_price"], part["selling_price"]))
    deal_part_id = c.lastrowid

    new_qty = max(0, part["quantity"] - item.quantity)
    c.execute("UPDATE parts SET quantity = ? WHERE id = ?", (new_qty, item.part_id))

    c.execute("""
        INSERT INTO stock_movements (part_id, type, quantity, deal_id, comment, created_at)
        VALUES (?, 'outgoing', ?, ?, ?, ?)
    """, (item.part_id, item.quantity, deal_id, f"Списание на сделку/наряд №{deal_id}", now_str))

    c.execute("""
        SELECT COALESCE(SUM(quantity * purchase_price), 0) FROM deal_parts WHERE deal_id = ?
    """, (deal_id,))
    parts_cost = round(c.fetchone()[0], 2)
    c.execute("UPDATE deals SET cost = ? WHERE id = ?", (parts_cost, deal_id))
    c.execute("SELECT COUNT(*) FROM deal_parts WHERE deal_id = ?", (deal_id,))
    parts_count = c.fetchone()[0]

    conn.commit()
    conn.close()
    return {
        "deal_part_id": deal_part_id,
        "part_id": item.part_id,
        "new_quantity": new_qty,
        "parts_cost": parts_cost,
        "parts_count": parts_count,
        "message": f"Запчасть «{part['name']}» ({item.quantity} шт.) списана со склада"
    }

@app.delete("/api/deals/{deal_id}/parts/{deal_part_id}")
@app.post("/api/deals/{deal_id}/parts/{deal_part_id}/delete")
@app.post("/api/deals/{deal_id}/parts/{deal_part_id}")
def remove_part_from_deal(deal_id: int, deal_part_id: int):
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("SELECT part_id, quantity FROM deal_parts WHERE id = ? AND deal_id = ?", (deal_part_id, deal_id))
    dp = c.fetchone()
    if not dp:
        conn.close()
        return {"message": "Запчасть уже удалена"}

    c.execute("UPDATE parts SET quantity = quantity + ? WHERE id = ?", (dp["quantity"], dp["part_id"]))
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute("""
        INSERT INTO stock_movements (part_id, type, quantity, deal_id, comment, created_at)
        VALUES (?, 'incoming', ?, ?, 'Возврат запчасти из наряда обратно на склад', ?)
    """, (dp["part_id"], dp["quantity"], deal_id, now_str))

    c.execute("DELETE FROM deal_parts WHERE id = ?", (deal_part_id,))

    c.execute("""
        SELECT COALESCE(SUM(quantity * purchase_price), 0) FROM deal_parts WHERE deal_id = ?
    """, (deal_id,))
    new_parts_cost = round(c.fetchone()[0], 2)
    c.execute("UPDATE deals SET cost = ? WHERE id = ?", (new_parts_cost, deal_id))

    c.execute("SELECT COUNT(*) FROM deal_parts WHERE deal_id = ?", (deal_id,))
    parts_count = c.fetchone()[0]

    c.execute("SELECT quantity FROM parts WHERE id = ?", (dp["part_id"],))
    p_row = c.fetchone()
    new_qty = p_row["quantity"] if p_row else 0

    conn.commit()
    conn.close()
    return {
        "message": "Запчасть возвращена на склад",
        "part_id": dp["part_id"],
        "new_quantity": new_qty,
        "parts_cost": new_parts_cost,
        "parts_count": parts_count
    }

# ----------------- Warehouse / Spare Parts -----------------

@app.get("/api/parts")
def list_parts(q: Optional[str] = None, low_stock: bool = False, category: Optional[str] = None):
    conn = database.get_connection()
    c = conn.cursor()
    query = "SELECT * FROM parts WHERE 1=1"
    params = []
    if q:
        query += " AND (sku LIKE ? OR name LIKE ? OR category LIKE ? OR location LIKE ?)"
        term = f"%{q}%"
        params.extend([term, term, term, term])
    if low_stock:
        query += " AND quantity <= min_threshold"
    if category and category != "all":
        query += " AND category = ?"
        params.append(category)
    query += " ORDER BY id DESC"

    c.execute(query, params)
    parts = [dict(r) for r in c.fetchall()]
    conn.close()
    return parts

@app.post("/api/parts")
def create_part(part: PartCreate):
    conn = database.get_connection()
    c = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        c.execute("""
            INSERT INTO parts (sku, name, category, quantity, min_threshold, purchase_price, selling_price, location, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (part.sku, part.name, part.category, part.quantity, part.min_threshold, part.purchase_price, part.selling_price, part.location, now_str))
        part_id = c.lastrowid
        if part.quantity > 0:
            c.execute("""
                INSERT INTO stock_movements (part_id, type, quantity, comment, created_at)
                VALUES (?, 'incoming', ?, 'Начальный остаток при создании карточки', ?)
            """, (part_id, part.quantity, now_str))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Запчасть с таким артикулом (SKU) уже существует!")
    conn.close()
    return {"id": part_id, "message": "Запчасть добавлена на склад"}

@app.put("/api/parts/{part_id}")
def update_part(part_id: int, part: PartCreate):
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("""
        UPDATE parts 
        SET sku = ?, name = ?, category = ?, min_threshold = ?, purchase_price = ?, selling_price = ?, location = ?
        WHERE id = ?
    """, (part.sku, part.name, part.category, part.min_threshold, part.purchase_price, part.selling_price, part.location, part_id))
    if c.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Запчасть не найдена")
    conn.commit()
    conn.close()
    return {"message": "Карточка запчасти обновлена"}

@app.post("/api/parts/{part_id}/stock")
def adjust_part_stock(part_id: int, adjust: PartStockAdjust):
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("SELECT id, name, quantity FROM parts WHERE id = ?", (part_id,))
    part = c.fetchone()
    if not part:
        conn.close()
        raise HTTPException(status_code=404, detail="Запчасть не найдена")

    new_qty = part["quantity"] + adjust.quantity_change
    if new_qty < 0:
        conn.close()
        raise HTTPException(status_code=400, detail="Остаток не может быть отрицательным!")

    m_type = "incoming" if adjust.quantity_change > 0 else "outgoing"
    c.execute("UPDATE parts SET quantity = ? WHERE id = ?", (new_qty, part_id))
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute("""
        INSERT INTO stock_movements (part_id, type, quantity, comment, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (part_id, m_type, abs(adjust.quantity_change), adjust.comment, now_str))

    conn.commit()
    conn.close()
    return {"new_quantity": new_qty, "message": "Остаток успешно изменен"}

@app.get("/api/stock/movements")
def get_stock_movements(limit: int = 50):
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT sm.*, p.name as part_name, p.sku as part_sku
        FROM stock_movements sm
        JOIN parts p ON sm.part_id = p.id
        ORDER BY sm.id DESC
        LIMIT ?
    """, (limit,))
    movements = [dict(r) for r in c.fetchall()]
    conn.close()
    return movements

@app.delete("/api/parts/{part_id}")
def delete_part(part_id: int):
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM parts WHERE id = ?", (part_id,))
    conn.commit()
    conn.close()
    return {"message": "Запчасть удалена"}

# ----------------- Tasks & Planner -----------------

@app.get("/api/tasks")
def list_tasks(status: Optional[str] = None):
    conn = database.get_connection()
    c = conn.cursor()
    query = """
        SELECT t.*, 
            c.name as client_name, c.company as client_company,
            d.title as deal_title
        FROM tasks t
        LEFT JOIN clients c ON t.client_id = c.id
        LEFT JOIN deals d ON t.deal_id = d.id
        WHERE 1=1
    """
    params = []
    if status and status != "all":
        query += " AND t.status = ?"
        params.append(status)
    query += " ORDER BY t.status DESC, t.due_date ASC"

    c.execute(query, params)
    tasks = [dict(r) for r in c.fetchall()]
    conn.close()
    return tasks

@app.post("/api/tasks")
def create_task(task: TaskCreate):
    conn = database.get_connection()
    c = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute("""
        INSERT INTO tasks (title, deal_id, client_id, due_date, priority, status, remind, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (task.title, task.deal_id, task.client_id, task.due_date, task.priority, task.status, task.remind, task.notes, now_str))
    task_id = c.lastrowid
    conn.commit()
    conn.close()
    return {"id": task_id, "message": "Задача добавлена в планировщик"}

@app.patch("/api/tasks/{task_id}/toggle")
def toggle_task(task_id: int):
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("SELECT status FROM tasks WHERE id = ?", (task_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Задача не найдена")
    
    new_status = "completed" if row["status"] != "completed" else "pending"
    c.execute("UPDATE tasks SET status = ? WHERE id = ?", (new_status, task_id))
    conn.commit()
    conn.close()
    return {"status": new_status, "message": "Статус задачи изменен"}

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int):
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return {"message": "Задача удалена"}

# ----------------- Export / Import -----------------

@app.get("/api/export/{table}")
def export_table_csv(table: str):
    valid_tables = ["clients", "equipment", "parts", "deals", "tasks", "users"]
    if table not in valid_tables:
        raise HTTPException(status_code=400, detail="Неверная таблица для экспорта")

    conn = database.get_connection()
    c = conn.cursor()
    
    if table == "users":
        c.execute("SELECT id, username, full_name, role, phone, created_at FROM users")
    else:
        c.execute(f"SELECT * FROM {table}")
        
    rows = c.fetchall()
    conn.close()

    if not rows:
        return Response(content="Таблица пуста", media_type="text/csv")

    output = io.StringIO()
    output.write('\ufeff')
    writer = csv.writer(output, delimiter=';')
    
    headers = [col[0] for col in c.description]
    writer.writerow(headers)
    
    for row in rows:
        writer.writerow([row[col] for col in headers])

    filename = f"export_{table}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    response = Response(content=output.getvalue().encode('utf-8-sig'), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response

@app.post("/api/import/clients")
async def import_clients(file: UploadFile = File(...)):
    content = await file.read()
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = content.decode('cp1251')

    reader = csv.DictReader(io.StringIO(text), delimiter=';' if ';' in text else ',')
    imported_count = 0

    conn = database.get_connection()
    c = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    for row in reader:
        name = row.get("name") or row.get("ФИО") or row.get("Имя")
        if not name:
            continue
        company = row.get("company") or row.get("Компания") or ""
        phone = row.get("phone") or row.get("Телефон") or ""
        email = row.get("email") or row.get("Email") or ""
        address = row.get("address") or row.get("Адрес") or ""
        notes = row.get("notes") or row.get("Заметки") or "Импортировано из файла"

        c.execute("""
            INSERT INTO clients (name, company, phone, email, address, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (name, company, phone, email, address, notes, now_str))
        imported_count += 1

    conn.commit()
    conn.close()
    return {"imported": imported_count, "message": f"Успешно импортировано {imported_count} клиентов"}

@app.post("/api/import/parts")
async def import_parts(file: UploadFile = File(...)):
    content = await file.read()
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = content.decode('cp1251')

    reader = csv.DictReader(io.StringIO(text), delimiter=';' if ';' in text else ',')
    imported_count = 0

    conn = database.get_connection()
    c = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    for row in reader:
        sku = row.get("sku") or row.get("Артикул")
        name = row.get("name") or row.get("Наименование")
        if not sku or not name:
            continue
        category = row.get("category") or row.get("Категория") or "Общее"
        try:
            quantity = int(row.get("quantity") or row.get("Количество") or 0)
        except ValueError:
            quantity = 0
        try:
            purchase_price = float(row.get("purchase_price") or row.get("Закупка") or 0.0)
        except ValueError:
            purchase_price = 0.0
        try:
            selling_price = float(row.get("selling_price") or row.get("Продажа") or 0.0)
        except ValueError:
            selling_price = 0.0
        location = row.get("location") or row.get("Склад") or ""

        try:
            c.execute("""
                INSERT OR REPLACE INTO parts (sku, name, category, quantity, purchase_price, selling_price, location, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (sku, name, category, quantity, purchase_price, selling_price, location, now_str))
            imported_count += 1
        except Exception:
            pass

    conn.commit()
    conn.close()
    return {"imported": imported_count, "message": f"Успешно импортировано {imported_count} запчастей"}

@app.post("/api/reset-demo")
def reset_demo_data():
    conn = database.get_connection()
    c = conn.cursor()
    c.executescript("""
        DELETE FROM deal_parts;
        DELETE FROM stock_movements;
        DELETE FROM tasks;
        DELETE FROM deals;
        DELETE FROM equipment;
        DELETE FROM parts;
        DELETE FROM clients;
        DELETE FROM users;
        DELETE FROM sqlite_sequence;
    """)
    database.seed_default_users(conn)
    database.seed_demo_data(conn)
    conn.close()
    return {"message": "База данных успешно сброшена к демонстрационным данным СТО Спецмаш"}

# ----------------- Static Frontend -----------------

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_index():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"status": "СТО Спецмаш CRM Server running."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
