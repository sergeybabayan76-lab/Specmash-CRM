"""
FastAPI Backend Server for СТО Спецмаш CRM.
Powered by Supabase PostgreSQL with real-time WebSockets synchronization for Kanban board.
"""

import os
import csv
import io
import json
import base64
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form, Response, WebSocket, WebSocketDisconnect, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Openpyxl for Excel .xlsx export
try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    openpyxl = None

# Load environment variables from .env if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import database

# Initialize database on startup
database.init_db()

app = FastAPI(title="СТО Спецмаш CRM API", version="1.2.1")

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

# ----------------- WebSocket Connection Manager -----------------

class KanbanConnectionManager:
    """Manages active WebSocket connections for live Kanban board updates across users."""
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead_connections = []
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.append(connection)
        for dead in dead_connections:
            self.disconnect(dead)

manager = KanbanConnectionManager()

@app.websocket("/ws/kanban")
async def websocket_kanban_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                mtype = msg.get("type")
                if mtype == "ping":
                    await websocket.send_json({"type": "pong", "timestamp": datetime.now().isoformat()})
                elif mtype in ("deal_moved", "deal_stage_updated", "stage_changed"):
                    deal_id = msg.get("deal_id")
                    new_stage = msg.get("stage")
                    if deal_id and new_stage:
                        try:
                            database.update_deal_stage(int(deal_id), str(new_stage))
                        except Exception as e:
                            print(f"[WS Stage Update Error] {e}")
                    await manager.broadcast(msg)
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

@app.get("/api/health")
def health_check():
    """Diagnostic endpoint to verify environment variables and database connectivity on Vercel."""
    conn_info = database.check_connection()
    detected_vars = [
        k for k in os.environ.keys()
        if any(term in k.upper() for term in ["SUPABASE", "SECRET", "KEY", "TOKEN", "DATABASE", "POSTGRES"])
    ]
    return {
        "status": "ok" if conn_info.get("connected") else "warning",
        "database": conn_info,
        "environment_variables_detected": detected_vars,
        "server_time": datetime.now().isoformat()
    }

@app.get("/api/realtime/config")
def get_realtime_config():
    """Provides Supabase Realtime endpoint parameters securely to authenticated frontend."""
    return {
        "url": database.get_supabase_url(),
        "key": database.get_supabase_key()
    }

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
    inn: Optional[str] = ""
    bank_name: Optional[str] = ""
    bank_account: Optional[str] = ""

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
    deal_type: Optional[str] = "service"
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
    if not database.get_supabase_key():
        raise HTTPException(
            status_code=503,
            detail="База данных Supabase не подключена. Пожалуйста, добавьте переменную SUPABASE_KEY в настройках Vercel."
        )
    user = database.get_user_by_username(req.username.strip().lower())
    if not user:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    if not database.verify_password(req.password, user["password_hash"], user["salt"]):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    return {
        "id": user["id"],
        "username": user["username"],
        "full_name": user["full_name"],
        "role": user["role"],
        "phone": user.get("phone") or "",
    }

@app.get("/api/users")
def list_users():
    return database.list_users()

def check_effective_role(x_user_role: Any = None, role: Any = None) -> str:
    if isinstance(x_user_role, str) and x_user_role.strip():
        return x_user_role.lower().strip()
    if isinstance(role, str) and role.strip():
        return role.lower().strip()
    return ""

@app.post("/api/users")
def create_user(u: UserCreate, x_user_role: Optional[str] = Header(None, alias="X-User-Role"), role: Optional[str] = None):
    effective_role = check_effective_role(x_user_role, role)
    if effective_role and effective_role != "admin":
        raise HTTPException(status_code=403, detail="Управление сотрудниками доступно исключительно Администратору")

    valid_roles = ["admin", "moderator", "manager", "mechanic"]
    if u.role not in valid_roles:
        raise HTTPException(status_code=400, detail="Недопустимая роль. Доступны: admin, moderator, manager, mechanic")

    clean_username = u.username.strip().lower()
    if len(clean_username) < 3 or clean_username in ('undefined', 'null'):
        raise HTTPException(status_code=400, detail="Логин сотрудника должен быть не короче 3 символов")
    if len(u.password) < 4:
        raise HTTPException(status_code=400, detail="Пароль должен быть не короче 4 символов")

    try:
        return database.create_user(u.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/users/{user_id}")
@app.post("/api/users/{user_id}")
def update_user(user_id: int, u: UserUpdate, x_user_role: Optional[str] = Header(None, alias="X-User-Role"), role: Optional[str] = None):
    effective_role = check_effective_role(x_user_role, role)
    if effective_role and effective_role != "admin":
        raise HTTPException(status_code=403, detail="Управление сотрудниками доступно исключительно Администратору")

    valid_roles = ["admin", "moderator", "manager", "mechanic"]
    if u.role not in valid_roles:
        raise HTTPException(status_code=400, detail="Недопустимая роль")

    try:
        return database.update_user(user_id, u.model_dump())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/users/{user_id}")
@app.post("/api/users/{user_id}/delete")
def delete_user(user_id: str, x_user_role: Optional[str] = Header(None, alias="X-User-Role"), role: Optional[str] = None):
    effective_role = check_effective_role(x_user_role, role)
    if effective_role and effective_role != "admin":
        raise HTTPException(status_code=403, detail="Управление сотрудниками доступно исключительно Администратору")

    if user_id in ('undefined', 'null', '0'):
        return {"message": "Некорректный сотрудник удален"}
    try:
        numeric_id = int(user_id)
        return database.delete_user(numeric_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ----------------- Settings & Branding & Backup -----------------

@app.get("/api/settings")
def get_settings():
    return database.get_settings()

@app.post("/api/settings")
def update_settings(s: FullSettingsUpdate):
    update_data = s.model_dump(exclude_unset=True)
    return database.update_settings(update_data)

@app.get("/api/settings/stats")
def get_system_stats():
    return database.get_system_stats()

@app.get("/api/settings/backup")
def download_database_backup():
    return database.dump_all_data()

@app.get("/api/backup/json")
def export_json_backup():
    """Exports full database state as JSON."""
    try:
        data = database.dump_all_data()
        data["exported_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        data["app"] = "СТО Спецмаш CRM"
        data["version"] = "2.0.0"
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
    """Syncs client records to PostgreSQL."""
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

    contents = await file.read()
    mime_types = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml", ".webp": "image/webp"
    }
    mime = mime_types.get(ext, "image/png")
    b64 = base64.b64encode(contents).decode("utf-8")
    logo_url = f"data:{mime};base64,{b64}"

    database.update_settings({"logo_url": logo_url})
    return {"logo_url": logo_url, "message": "Логотип успешно обновлен"}

@app.delete("/api/settings/logo")
def delete_logo():
    database.update_settings({"logo_url": ""})
    return {"message": "Логотип сброшен к стандартному"}

# ----------------- Dashboard & Analytics -----------------

@app.get("/api/dashboard")
def get_dashboard():
    return database.get_dashboard_metrics()

# ----------------- Clients -----------------

@app.get("/api/clients")
def list_clients(q: Optional[str] = None):
    return database.list_clients(q=q)

@app.post("/api/clients")
def create_client(client: ClientCreate):
    return database.create_client(client.model_dump())

@app.get("/api/clients/{client_id}")
def get_client(client_id: int):
    try:
        return database.get_crm_client(client_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Клиент не найден")

@app.put("/api/clients/{client_id}")
@app.post("/api/clients/{client_id}")
def update_client(client_id: int, client: ClientCreate):
    return database.update_client(client_id, client.model_dump())

@app.delete("/api/clients/{client_id}")
@app.post("/api/clients/{client_id}/delete")
def delete_client(client_id: int):
    return database.delete_client(client_id)

# ----------------- Equipment (База техники) -----------------

@app.get("/api/equipment")
def list_equipment(q: Optional[str] = None, category: Optional[str] = None):
    return database.list_equipment(q=q, category=category)

@app.post("/api/equipment")
def create_equipment(eq: EquipmentCreate):
    return database.create_equipment(eq.model_dump())

@app.get("/api/equipment/{eq_id}")
def get_equipment_detail(eq_id: int):
    try:
        return database.get_equipment(eq_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Техника не найдена")

@app.put("/api/equipment/{eq_id}")
@app.post("/api/equipment/{eq_id}")
def update_equipment(eq_id: int, eq: EquipmentCreate):
    return database.update_equipment(eq_id, eq.model_dump())

@app.delete("/api/equipment/{eq_id}")
@app.post("/api/equipment/{eq_id}/delete")
def delete_equipment(eq_id: int):
    return database.delete_equipment(eq_id)

# ----------------- Deals / Kanban & List Pipeline -----------------

@app.get("/api/deals")
def list_deals(stage: Optional[str] = None, q: Optional[str] = None, deal_type: Optional[str] = None):
    return database.list_deals(stage=stage, q=q, deal_type=deal_type)

@app.post("/api/deals")
async def create_deal(deal: DealCreate):
    res = database.create_deal(deal.model_dump())
    # Broadcast to all connected WebSockets
    await manager.broadcast({
        "type": "deal_created",
        "deal": res
    })
    return res

@app.get("/api/deals/{deal_id}")
def get_deal(deal_id: int):
    try:
        return database.get_deal(deal_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Сделка не найдена")

@app.patch("/api/deals/{deal_id}/stage")
@app.post("/api/deals/{deal_id}/stage")
@app.put("/api/deals/{deal_id}/stage")
async def update_deal_stage(deal_id: int, update: DealStageUpdate):
    res = database.update_deal_stage(deal_id, update.stage)
    # Broadcast stage change to all clients instantly!
    await manager.broadcast({
        "type": "deal_stage_updated",
        "deal_id": deal_id,
        "stage": update.stage,
        "data": res
    })
    return res

@app.put("/api/deals/{deal_id}")
@app.post("/api/deals/{deal_id}")
async def update_deal(deal_id: int, deal: DealCreate):
    res = database.update_deal(deal_id, deal.model_dump())
    await manager.broadcast({
        "type": "deal_updated",
        "deal_id": deal_id,
        "deal": res
    })
    return res

@app.delete("/api/deals/{deal_id}")
@app.post("/api/deals/{deal_id}/delete")
async def delete_deal(deal_id: int):
    res = database.delete_deal(deal_id)
    await manager.broadcast({
        "type": "deal_deleted",
        "deal_id": deal_id
    })
    return res

@app.post("/api/deals/{deal_id}/parts")
async def attach_part_to_deal(deal_id: int, item: DealAttachPart):
    try:
        res = database.attach_part_to_deal(deal_id, item.part_id, item.quantity)
        await manager.broadcast({
            "type": "deal_parts_updated",
            "deal_id": deal_id,
            "data": res
        })
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/deals/{deal_id}/parts/{deal_part_id}")
@app.post("/api/deals/{deal_id}/parts/{deal_part_id}/delete")
@app.post("/api/deals/{deal_id}/parts/{deal_part_id}")
async def remove_part_from_deal(deal_id: int, deal_part_id: int):
    try:
        res = database.remove_part_from_deal(deal_id, deal_part_id)
        await manager.broadcast({
            "type": "deal_parts_updated",
            "deal_id": deal_id,
            "data": res
        })
        return res
    except KeyError:
        return {"message": "Запчасть уже удалена"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- Warehouse / Spare Parts -----------------

@app.get("/api/parts")
def list_parts(q: Optional[str] = None, low_stock: bool = False, category: Optional[str] = None):
    return database.list_parts(q=q, low_stock=low_stock, category=category)

@app.post("/api/parts")
def create_part(part: PartCreate):
    try:
        return database.create_part(part.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка сохранения запчасти: {str(e)}")

@app.put("/api/parts/{part_id}")
@app.post("/api/parts/{part_id}")
def update_part(part_id: int, part: PartCreate):
    return database.update_part(part_id, part.model_dump())

@app.post("/api/parts/{part_id}/stock")
def adjust_part_stock(part_id: int, adjust: PartStockAdjust):
    try:
        return database.adjust_part_stock(part_id, adjust.quantity_change, adjust.comment or "Корректировка остатка")
    except KeyError:
        raise HTTPException(status_code=404, detail="Запчасть не найдена")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/stock/movements")
def get_stock_movements(limit: int = 50):
    return database.get_stock_movements(limit=limit)

@app.delete("/api/parts/{part_id}")
@app.post("/api/parts/{part_id}/delete")
def delete_part(part_id: int):
    return database.delete_part(part_id)

# ----------------- Tasks & Planner -----------------

@app.get("/api/tasks")
def list_tasks(status: Optional[str] = None):
    return database.list_tasks(status=status)

@app.post("/api/tasks")
def create_task(task: TaskCreate):
    return database.create_task(task.model_dump())

@app.patch("/api/tasks/{task_id}/toggle")
@app.post("/api/tasks/{task_id}/toggle")
def toggle_task(task_id: int):
    try:
        return database.toggle_task(task_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Задача не найдена")

@app.delete("/api/tasks/{task_id}")
@app.post("/api/tasks/{task_id}/delete")
def delete_task(task_id: int):
    return database.delete_task(task_id)

# ----------------- Export / Import -----------------

ROLE_LABELS = {
    'admin': 'Администратор',
    'moderator': 'Модератор',
    'manager': 'Менеджер (допуск Механика)',
    'mechanic': 'Мастер-механик'
}

STAGE_LABELS = {
    'new': 'Новая заявка / Запрос',
    'diagnostic': 'Диагностика',
    'estimate': 'Подбор / Согласование сметы',
    'in_progress': 'В работе / Ремонт',
    'parts_waiting': 'Ожидание запчастей',
    'ready': 'Готово к выдаче / Скомплектовано',
    'completed': 'Оплачено и выдано',
    'cancelled': 'Отказ / Архив'
}

def generate_table_xlsx(table: str) -> bytes:
    if not openpyxl:
        raise HTTPException(status_code=500, detail="Модуль openpyxl не установлен на сервере")

    wb = openpyxl.Workbook()
    ws = wb.active
    header_fill = PatternFill(start_color='1E293B', end_color='1E293B', fill_type='solid')
    header_font = Font(name='Calibri', size=11, bold=True, color='FFFFFF')
    header_align = Alignment(horizontal='center', vertical='center', wrap_text=True)
    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'), right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'), bottom=Side(style='thin', color='CBD5E1')
    )

    headers = []
    rows_data = []

    if table == 'clients':
        ws.title = 'База клиентов'
        headers = ['ID', 'ФИО / Контактное лицо', 'Компания', 'Телефон', 'Email', 'ИНН', 'Банк', 'Расчетный счет', 'Фактический адрес', 'Заметки', 'Дата регистрации']
        for c in database.list_clients():
            rows_data.append([
                c.get('id'), c.get('name', ''), c.get('company', ''), c.get('phone', ''),
                c.get('email', ''), c.get('inn', ''), c.get('bank_name', ''), c.get('bank_account', ''),
                c.get('address', ''), c.get('notes', ''), c.get('created_at', '')
            ])
    elif table == 'equipment':
        ws.title = 'База техники'
        headers = ['ID', 'Марка и модель техники', 'Категория', 'VIN / Серийный №', 'Год выпуска', 'Наработка', 'Статус', 'Владелец (Клиент)', 'Примечания', 'Дата добавления']
        for eq in database.list_equipment():
            rows_data.append([
                eq.get('id'), eq.get('name', ''), eq.get('category', ''), eq.get('serial_vin', ''),
                eq.get('year') or '', eq.get('operating_hours', ''), eq.get('status', ''),
                eq.get('client_name', ''), eq.get('notes', ''), eq.get('created_at', '')
            ])
    elif table == 'parts':
        ws.title = 'Склад запчастей'
        headers = ['ID', 'Артикул (SKU)', 'Наименование запчасти', 'Категория', 'Остаток на складе', 'Мин. порог', 'Себестоимость (AMD)', 'Розничная цена (AMD)', 'Место хранения']
        for p in database.list_parts():
            rows_data.append([
                p.get('id'), p.get('sku', ''), p.get('name', ''), p.get('category', ''),
                p.get('quantity', 0), p.get('min_threshold', 2),
                float(p.get('purchase_price') or 0.0), float(p.get('selling_price') or 0.0),
                p.get('location', '')
            ])
    elif table == 'deals':
        ws.title = 'Заказ-наряды и продажи'
        headers = ['ID', 'Тип сделки', 'Тема наряда / Заказ', 'Клиент / Заказчик', 'Техника заказчика', 'VIN номер', 'Стадия воронки', 'Приоритет', 'Ответственный', 'Сумма (AMD)', 'Себестоимость (AMD)', 'Прибыль (AMD)', 'Срок (Дедлайн)', 'Дата создания', 'Дата завершения']
        for d in database.list_deals():
            stage_ru = STAGE_LABELS.get(d.get('stage'), d.get('stage', ''))
            amt = float(d.get('amount') or 0.0)
            cst = float(d.get('cost') or 0.0)
            type_ru = "Продажа запчастей" if d.get('deal_type') == 'parts_sale' else "Заказ-наряд СТО"
            rows_data.append([
                d.get('id'), type_ru, d.get('title', ''), d.get('client_name', ''), d.get('equipment_name', ''),
                d.get('equipment_vin', ''), stage_ru, d.get('priority', 'normal'), d.get('responsible', ''),
                amt, cst, amt - cst, d.get('deadline') or '', d.get('created_at', ''), d.get('completed_at') or ''
            ])
    elif table == 'users':
        ws.title = 'Сотрудники СТО'
        headers = ['ID', 'ФИО сотрудника', 'Логин', 'Роль в системе', 'Телефон', 'Дата регистрации']
        for u in database.list_users():
            role_ru = ROLE_LABELS.get(u.get('role'), u.get('role', ''))
            rows_data.append([
                u.get('id'), u.get('full_name', ''), u.get('username', ''),
                role_ru, u.get('phone', ''), u.get('created_at', '')
            ])
    else:
        raise HTTPException(status_code=400, detail="Неверная таблица для экспорта")

    ws.append(headers)
    ws.row_dimensions[1].height = 28
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_align
        cell.border = thin_border

    for row_idx, r in enumerate(rows_data, 2):
        ws.append(r)
        ws.row_dimensions[row_idx].height = 20
        for cell in ws[row_idx]:
            cell.border = thin_border
            cell.alignment = Alignment(vertical='center')

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = min(max(max_len + 4, 12), 45)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()

@app.get("/api/export/{table}/xlsx")
def export_table_xlsx(table: str, x_user_role: Optional[str] = Header(None, alias="X-User-Role"), role: Optional[str] = None):
    effective_role = check_effective_role(x_user_role, role)
    if effective_role in ("mechanic", "manager"):
        raise HTTPException(status_code=403, detail="Доступ к разделу 'Импорт & Экспорт' запрещен для роли Механик/Менеджер")

    xlsx_bytes = generate_table_xlsx(table)
    filename = f"specmash_{table}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    response = Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response

@app.get("/api/export/{table}")
def export_table(table: str, format: str = "xlsx", x_user_role: Optional[str] = Header(None, alias="X-User-Role"), role: Optional[str] = None):
    effective_role = check_effective_role(x_user_role, role)
    if effective_role in ("mechanic", "manager"):
        raise HTTPException(status_code=403, detail="Доступ к разделу 'Импорт & Экспорт' запрещен для роли Механик/Менеджер")

    if format == "xlsx":
        return export_table_xlsx(table, x_user_role, role)

    valid_tables = ["clients", "equipment", "parts", "deals", "tasks", "users"]
    if table not in valid_tables:
        raise HTTPException(status_code=400, detail="Неверная таблица для экспорта")

    with database.get_sb_client() as client:
        r = client.get(f"/{table}", params={"select": "*"})
        rows = r.json() if r.status_code == 200 else []

    if not rows:
        return Response(content="Таблица пуста", media_type="text/csv")

    output = io.StringIO()
    output.write('\ufeff')
    writer = csv.writer(output, delimiter=';')
    headers = list(rows[0].keys())
    writer.writerow(headers)
    for row in rows:
        writer.writerow([row.get(col, '') for col in headers])

    filename = f"export_{table}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    response = Response(content=output.getvalue().encode('utf-8-sig'), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response

@app.post("/api/import/clients")
async def import_clients(file: UploadFile = File(...), x_user_role: Optional[str] = Header(None, alias="X-User-Role"), role: Optional[str] = None):
    effective_role = check_effective_role(x_user_role, role)
    if effective_role in ("mechanic", "manager"):
        raise HTTPException(status_code=403, detail="Доступ к импорту запрещен для роли Механик/Менеджер")

    content = await file.read()
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = content.decode('cp1251')

    reader = csv.DictReader(io.StringIO(text), delimiter=';' if ';' in text else ',')
    imported_count = 0

    for row in reader:
        name = row.get("name") or row.get("ФИО") or row.get("Имя")
        if not name:
            continue
        try:
            database.create_client({
                "name": name.strip(),
                "company": (row.get("company") or row.get("Компания") or "").strip(),
                "phone": (row.get("phone") or row.get("Телефон") or "+37499000000").strip(),
                "email": (row.get("email") or row.get("Email") or "").strip(),
                "address": (row.get("address") or row.get("Адрес") or "").strip(),
                "notes": (row.get("notes") or row.get("Заметки") or "Импортировано из CSV").strip(),
                "inn": (row.get("inn") or row.get("ИНН") or "").strip(),
                "bank_name": (row.get("bank_name") or row.get("Банк") or "").strip(),
                "bank_account": (row.get("bank_account") or row.get("Счет") or "").strip(),
            })
            imported_count += 1
        except Exception:
            pass

    return {"imported": imported_count, "message": f"Успешно импортировано {imported_count} клиентов"}

@app.post("/api/import/parts")
async def import_parts(file: UploadFile = File(...), x_user_role: Optional[str] = Header(None, alias="X-User-Role"), role: Optional[str] = None):
    effective_role = check_effective_role(x_user_role, role)
    if effective_role in ("mechanic", "manager"):
        raise HTTPException(status_code=403, detail="Доступ к импорту запрещен для роли Механик/Менеджер")

    content = await file.read()
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = content.decode('cp1251')

    reader = csv.DictReader(io.StringIO(text), delimiter=';' if ';' in text else ',')
    imported_count = 0

    for row in reader:
        sku = row.get("sku") or row.get("Артикул")
        name = row.get("name") or row.get("Наименование")
        if not sku or not name:
            continue
        try:
            database.create_part({
                "sku": sku.strip(),
                "name": name.strip(),
                "category": (row.get("category") or row.get("Категория") or "Общее").strip(),
                "quantity": int(row.get("quantity") or row.get("Количество") or 0),
                "purchase_price": float(row.get("purchase_price") or row.get("Закупка") or 0.0),
                "selling_price": float(row.get("selling_price") or row.get("Продажа") or 0.0),
                "location": (row.get("location") or row.get("Склад") or "").strip(),
                "min_threshold": int(row.get("min_threshold") or 2)
            })
            imported_count += 1
        except Exception:
            pass

    return {"imported": imported_count, "message": f"Успешно импортировано {imported_count} запчастей"}

@app.post("/api/reset-demo")
def reset_demo_data(x_user_role: Optional[str] = Header(None, alias="X-User-Role"), role: Optional[str] = None):
    effective_role = check_effective_role(x_user_role, role)
    if effective_role and effective_role != "admin":
        raise HTTPException(status_code=403, detail="Сброс к демонстрационным данным разрешен только Администратору системы")
    database.init_db()
    return {"message": "База данных успешно инициализирована данными СТО Спецмаш"}

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
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("server:app", host=host, port=port, reload=True)
