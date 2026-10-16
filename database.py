"""
Database management and models for СТО Спецмаш CRM.
Powered by Supabase PostgreSQL with high-performance PostgREST client and automatic fallback.
"""

import os
import hashlib
import secrets
from datetime import datetime
import re
from typing import List, Dict, Any, Optional
import httpx

# Load environment variables from .env if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Fallback: load .env manually if python-dotenv is not available
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(_env_path):
    try:
        with open(_env_path, "r", encoding="utf-8") as _f:
            for _line in _f:
                _line = _line.strip()
                if not _line or _line.startswith("#") or "=" not in _line:
                    continue
                _k, _v = _line.split("=", 1)
                _k = _k.strip()
                _v = _v.strip().strip("'\"")
                if _k and _k not in os.environ:
                    os.environ[_k] = _v
    except Exception:
        pass

# Supabase PostgreSQL Configuration via Environment Variables
SUPABASE_URL = ""
SUPABASE_KEY = ""

def get_supabase_url() -> str:
    global SUPABASE_URL
    if SUPABASE_URL:
        return SUPABASE_URL
    raw_url = os.getenv("SUPABASE_URL", "").strip()
    url_match = re.fullmatch(r"https://[A-Za-z0-9.-]+\.supabase\.co/?", raw_url)
    SUPABASE_URL = url_match.group(0).rstrip("/") if url_match else ""
    return SUPABASE_URL

def get_supabase_key() -> str:
    global SUPABASE_KEY
    if SUPABASE_KEY:
        return SUPABASE_KEY

    SUPABASE_KEY = (
        os.getenv("SUPABASE_KEY")
        or os.getenv("SUPABASE_SECRET_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or ""
    ).strip().strip("'\"`")
    return SUPABASE_KEY

# Initialize on import
SUPABASE_URL = get_supabase_url()
SUPABASE_KEY = get_supabase_key()

def check_connection() -> Dict[str, Any]:
    key = get_supabase_key()
    url = get_supabase_url()
    if not key:
        return {
            "connected": False,
            "error": "SUPABASE_KEY не задана в .env или окружении сервера",
            "url": url,
            "has_key": False
        }
    if not url:
        return {
            "connected": False,
            "error": "SUPABASE_URL не задан или имеет неверный формат",
            "url": "",
            "has_key": True
        }
    try:
        with get_sb_client() as client:
            r = client.get("/settings", params={"select": "key", "limit": "1"})
            if r.status_code == 200:
                return {
                    "connected": True,
                    "status_code": r.status_code,
                    "url": url,
                    "has_key": True
                }
            else:
                return {
                    "connected": False,
                    "status_code": r.status_code,
                    "error": f"Supabase HTTP {r.status_code}: {r.text[:200]}",
                    "url": url,
                    "has_key": True
                }
    except Exception as e:
        return {
            "connected": False,
            "error": str(e),
            "url": url,
            "has_key": True
        }

DEFAULT_SETTINGS = {
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

def get_sb_client() -> httpx.Client:
    key = get_supabase_key()
    url = get_supabase_url()
    if not key or not url:
        raise RuntimeError("Настройте SUPABASE_URL и серверный SUPABASE_KEY в .env")
    headers = {
        "Content-Type": "application/json",
        "Prefer": "return=representation",
        "User-Agent": "SpecMash-CRM/FastAPI",
        "apikey": key,
    }
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    return httpx.Client(
        base_url=f"{url}/rest/v1",
        headers=headers,
        timeout=20.0
    )

def init_db():
    """Verifies Supabase schema and optionally creates an admin from explicit credentials."""
    if not get_supabase_key() or not get_supabase_url():
        print("[Supabase Warning] Set SUPABASE_URL and a server-only SUPABASE_KEY in .env.")
        return
    try:
        ensure_bootstrap_admin()
    except Exception as exc:
        raise RuntimeError(
            "Cannot initialize Supabase. Verify the project URL/key and run schema.sql "
            "in the new project's SQL Editor."
        ) from exc

def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return hashed, salt

def verify_password(password: str, hashed: str, salt: str) -> bool:
    new_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(new_hash, hashed)

def get_next_id(client: httpx.Client, table: str) -> int:
    try:
        r = client.get(f"/{table}", params={"select": "id", "order": "id.desc", "limit": "1"})
        data = r.json()
        if data and isinstance(data, list) and len(data) > 0:
            return int(data[0].get("id", 0)) + 1
    except Exception:
        pass
    return 1

# ==================== USERS & AUTH ====================

def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    if not SUPABASE_KEY:
        return None
    with get_sb_client() as client:
        r = client.get("/users", params={"username": f"ilike.{username.strip()}", "limit": "1"})
        users = r.json()
        if users and isinstance(users, list) and len(users) > 0:
            return users[0]
    return None

def list_users() -> List[Dict[str, Any]]:
    if not SUPABASE_KEY:
        return []
    with get_sb_client() as client:
        r = client.get("/users", params={"select": "id,username,full_name,role,phone,created_at", "order": "id.asc"})
        return r.json() if r.status_code == 200 else []

def create_user(data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        existing = get_user_by_username(data["username"])
        if existing:
            raise ValueError("Пользователь с таким логином уже существует!")
        
        salt = secrets.token_hex(16)
        p_hash, salt = hash_password(data["password"], salt)
        next_id = get_next_id(client, "users")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        payload = {
            "id": next_id,
            "username": data["username"].strip().lower(),
            "password_hash": p_hash,
            "salt": salt,
            "full_name": data.get("full_name", "").strip(),
            "role": data.get("role", "mechanic"),
            "phone": data.get("phone", "").strip(),
            "created_at": now_str
        }
        r = client.post("/users", json=payload)
        if r.status_code not in (200, 201):
            raise Exception(r.text)
        res = r.json()
        return res[0] if isinstance(res, list) else res

def update_user(user_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        payload = {}
        if "full_name" in data and data["full_name"]:
            payload["full_name"] = data["full_name"].strip()
        if "role" in data and data["role"]:
            payload["role"] = data["role"]
        if "phone" in data:
            payload["phone"] = data["phone"].strip()
        if "password" in data and data["password"]:
            salt = secrets.token_hex(16)
            p_hash, salt = hash_password(data["password"], salt)
            payload["password_hash"] = p_hash
            payload["salt"] = salt
        
        r = client.patch(f"/users?id=eq.{user_id}", json=payload)
        if r.status_code not in (200, 204):
            raise Exception(r.text)
        return {"id": user_id, "message": "Сотрудник обновлен"}

def delete_user(user_id: int) -> Dict[str, Any]:
    with get_sb_client() as client:
        r = client.delete(f"/users?id=eq.{user_id}")
        return {"id": user_id, "message": "Сотрудник удален"}

def ensure_bootstrap_admin():
    admin_user = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "").strip().lower()
    admin_pass = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
    if bool(admin_user) != bool(admin_pass):
        raise RuntimeError("Both BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD must be set.")
    if admin_user and (len(admin_user) < 3 or len(admin_pass) < 12):
        raise RuntimeError("Bootstrap username must be at least 3 characters and password at least 12 characters.")

    with get_sb_client() as client:
        response = client.get("/users", params={"select": "id", "limit": "1"})
        response.raise_for_status()
        if response.json() or not admin_user:
            if not admin_user:
                print("[Supabase] Database verified; no users created. Set bootstrap credentials to create the first admin.")
            return

        password_hash, salt = hash_password(admin_pass)
        response = client.post("/users?on_conflict=username", json={
            "id": 1,
            "username": admin_user,
            "password_hash": password_hash,
            "salt": salt,
            "full_name": "Администратор",
            "role": "admin",
            "phone": "",
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }, headers={"Prefer": "resolution=ignore-duplicates,return=minimal"})
        response.raise_for_status()

# ==================== SETTINGS ====================

def get_settings() -> Dict[str, Any]:
    if not SUPABASE_KEY:
        return dict(DEFAULT_SETTINGS)
    with get_sb_client() as client:
        r = client.get("/settings", params={"select": "*"})
        settings_dict = dict(DEFAULT_SETTINGS)
        if r.status_code == 200:
            for item in r.json():
                settings_dict[item["key"]] = item["value"]
        return settings_dict

def update_settings(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not SUPABASE_KEY:
        return {"message": "SUPABASE_KEY не настроен"}
    with get_sb_client() as client:
        for key, value in payload.items():
            if value is not None:
                client.post("/settings", json={"key": key, "value": str(value).strip()}, headers={"Prefer": "resolution=merge-duplicates"})
        return {"message": "Основные настройки программы успешно сохранены"}

def get_system_stats() -> Dict[str, Any]:
    if not SUPABASE_KEY:
        return {
            "version": "2.0.0 (Supabase PostgreSQL)",
            "db_type": "PostgreSQL (Cloud Supabase)",
            "configured": False,
            "message": "Настройте Supabase URL и серверный ключ в окружении приложения",
            "db_size_kb": None,
            "counts": {"clients": 0, "equipment": 0, "parts": 0, "deals": 0, "users": 0, "tasks": 0}
        }
    with get_sb_client() as client:
        def count(table):
            r = client.get(f"/{table}", params={"select": "id"})
            return len(r.json()) if r.status_code == 200 else 0

        return {
            "version": "2.0.0 (Supabase PostgreSQL)",
            "db_type": "PostgreSQL (Cloud Supabase)",
            "db_size_kb": None,
            "counts": {
                "clients": count("clients"),
                "equipment": count("equipment"),
                "parts": count("parts"),
                "deals": count("deals"),
                "users": count("users"),
                "tasks": count("tasks"),
            }
        }

# ==================== CLIENTS ====================

def list_clients(q: Optional[str] = None) -> List[Dict[str, Any]]:
    if not SUPABASE_KEY:
        return []
    with get_sb_client() as client:
        params = {
            "select": "*,equipment(id),deals(id,amount,stage)",
            "order": "id.desc"
        }
        if q:
            term = q.strip()
            params["or"] = f"(name.ilike.*{term}*,company.ilike.*{term}*,phone.ilike.*{term}*,email.ilike.*{term}*)"
        
        r = client.get("/clients", params=params)
        if r.status_code != 200:
            return []
        
        clients = []
        for c in r.json():
            eq_count = len(c.get("equipment") or [])
            deals = c.get("deals") or []
            deals_count = len(deals)
            total_rev = sum(d.get("amount", 0) for d in deals if d.get("stage") == "completed")
            item = dict(c)
            item.pop("equipment", None)
            item.pop("deals", None)
            item["equipment_count"] = eq_count
            item["deals_count"] = deals_count
            item["total_revenue"] = total_rev
            clients.append(item)
        return clients

def create_client(client_data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        next_id = get_next_id(client, "clients")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        payload = {
            "id": next_id,
            "name": client_data["name"].strip(),
            "company": (client_data.get("company") or "").strip(),
            "phone": client_data["phone"].strip(),
            "email": (client_data.get("email") or "").strip(),
            "address": (client_data.get("address") or "").strip(),
            "notes": (client_data.get("notes") or "").strip(),
            "created_at": now_str
        }
        r = client.post("/clients", json=payload)
        if r.status_code not in (200, 201):
            raise Exception(r.text)
        res = r.json()
        item = res[0] if isinstance(res, list) else res
        item["message"] = "Клиент успешно добавлен"
        return item

def get_crm_client(client_id: int) -> Dict[str, Any]:
    with get_sb_client() as client:
        r = client.get("/clients", params={"id": f"eq.{client_id}", "select": "*"})
        rows = r.json()
        if not rows:
            raise KeyError("Клиент не найден")
        c = rows[0]

        eq_r = client.get("/equipment", params={"client_id": f"eq.{client_id}", "order": "id.desc"})
        c["equipment"] = eq_r.json() if eq_r.status_code == 200 else []

        dl_r = client.get("/deals", params={"client_id": f"eq.{client_id}", "select": "*,equipment(name)", "order": "id.desc"})
        deals = []
        if dl_r.status_code == 200:
            for d in dl_r.json():
                eq = d.get("equipment") or {}
                d["equipment_name"] = eq.get("name", "")
                d.pop("equipment", None)
                deals.append(d)
        c["deals"] = deals

        tsk_r = client.get("/tasks", params={"client_id": f"eq.{client_id}", "order": "due_date.asc"})
        c["tasks"] = tsk_r.json() if tsk_r.status_code == 200 else []

        return c

get_client_by_id = get_crm_client

def update_client(client_id: int, client_data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        payload = {
            "name": client_data["name"].strip(),
            "company": (client_data.get("company") or "").strip(),
            "phone": client_data["phone"].strip(),
            "email": (client_data.get("email") or "").strip(),
            "address": (client_data.get("address") or "").strip(),
            "notes": (client_data.get("notes") or "").strip(),
        }
        r = client.patch(f"/clients?id=eq.{client_id}", json=payload)
        if r.status_code not in (200, 204):
            # Upsert fallback
            payload["id"] = client_id
            payload["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            client.post("/clients", json=payload, headers={"Prefer": "resolution=merge-duplicates"})
        return {"id": client_id, **payload, "message": "Данные клиента обновлены"}

def delete_client(client_id: int) -> Dict[str, Any]:
    with get_sb_client() as client:
        client.delete(f"/clients?id=eq.{client_id}")
        return {"id": client_id, "message": "Клиент удален"}

# ==================== EQUIPMENT ====================

def list_equipment(q: Optional[str] = None, category: Optional[str] = None) -> List[Dict[str, Any]]:
    if not SUPABASE_KEY:
        return []
    with get_sb_client() as client:
        params = {
            "select": "*,clients(name,company,phone)",
            "order": "id.desc"
        }
        if category and category != "all":
            params["category"] = f"eq.{category}"
        if q:
            term = q.strip()
            params["or"] = f"(name.ilike.*{term}*,serial_vin.ilike.*{term}*)"

        r = client.get("/equipment", params=params)
        if r.status_code != 200:
            return []
        
        items = []
        for eq in r.json():
            cl = eq.get("clients") or {}
            item = dict(eq)
            item.pop("clients", None)
            item["client_name"] = cl.get("name", "")
            item["client_company"] = cl.get("company", "")
            item["client_phone"] = cl.get("phone", "")
            items.append(item)
        return items

def create_equipment(eq_data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        next_id = get_next_id(client, "equipment")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        payload = {
            "id": next_id,
            "client_id": eq_data.get("client_id") if eq_data.get("client_id") and eq_data.get("client_id") > 0 else None,
            "name": eq_data["name"].strip(),
            "category": eq_data.get("category", "Спецтехника"),
            "serial_vin": (eq_data.get("serial_vin") or "").strip(),
            "year": eq_data.get("year"),
            "operating_hours": (eq_data.get("operating_hours") or "").strip(),
            "status": eq_data.get("status") or "Исправна",
            "notes": (eq_data.get("notes") or "").strip(),
            "created_at": now_str
        }
        r = client.post("/equipment", json=payload)
        if r.status_code not in (200, 201):
            raise Exception(r.text)
        res = r.json()
        item = res[0] if isinstance(res, list) else res
        item["message"] = "Единица техники успешно зарегистрирована"
        return item

def get_equipment(eq_id: int) -> Dict[str, Any]:
    with get_sb_client() as client:
        r = client.get("/equipment", params={"id": f"eq.{eq_id}", "select": "*,clients(name,company,phone)"})
        rows = r.json()
        if not rows:
            raise KeyError("Техника не найдена")
        eq = rows[0]
        cl = eq.get("clients") or {}
        eq.pop("clients", None)
        eq["client_name"] = cl.get("name", "")
        eq["client_company"] = cl.get("company", "")
        eq["client_phone"] = cl.get("phone", "")

        dl_r = client.get("/deals", params={"equipment_id": f"eq.{eq_id}", "order": "id.desc"})
        eq["deals_history"] = dl_r.json() if dl_r.status_code == 200 else []
        return eq

def update_equipment(eq_id: int, eq_data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        payload = {
            "client_id": eq_data.get("client_id") if eq_data.get("client_id") and eq_data.get("client_id") > 0 else None,
            "name": eq_data["name"].strip(),
            "category": eq_data.get("category", "Спецтехника"),
            "serial_vin": (eq_data.get("serial_vin") or "").strip(),
            "year": eq_data.get("year"),
            "operating_hours": (eq_data.get("operating_hours") or "").strip(),
            "status": eq_data.get("status") or "Исправна",
            "notes": (eq_data.get("notes") or "").strip(),
        }
        r = client.patch(f"/equipment?id=eq.{eq_id}", json=payload)
        if r.status_code not in (200, 204):
            payload["id"] = eq_id
            payload["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            client.post("/equipment", json=payload, headers={"Prefer": "resolution=merge-duplicates"})
        return {"id": eq_id, **payload, "message": "Данные по технике обновлены"}

def delete_equipment(eq_id: int) -> Dict[str, Any]:
    with get_sb_client() as client:
        client.delete(f"/equipment?id=eq.{eq_id}")
        return {"id": eq_id, "message": "Техника удалена"}

# ==================== PARTS & WAREHOUSE ====================

def list_parts(q: Optional[str] = None, low_stock: bool = False, category: Optional[str] = None) -> List[Dict[str, Any]]:
    if not SUPABASE_KEY:
        return []
    with get_sb_client() as client:
        params = {"select": "*", "order": "id.desc"}
        if category and category != "all":
            params["category"] = f"eq.{category}"
        if q:
            term = q.strip()
            params["or"] = f"(sku.ilike.*{term}*,name.ilike.*{term}*,category.ilike.*{term}*,location.ilike.*{term}*)"

        r = client.get("/parts", params=params)
        if r.status_code != 200:
            return []
        parts = r.json()
        if low_stock:
            parts = [p for p in parts if p.get("quantity", 0) <= p.get("min_threshold", 2)]
        return parts

def create_part(part_data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        # Check SKU uniqueness
        sku = part_data["sku"].strip()
        chk = client.get("/parts", params={"sku": f"eq.{sku}"}).json()
        if chk:
            raise ValueError(f"Запчасть с артикулом {sku} уже существует!")

        next_id = get_next_id(client, "parts")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        qty = int(part_data.get("quantity") or 0)
        payload = {
            "id": next_id,
            "sku": sku,
            "name": part_data["name"].strip(),
            "category": (part_data.get("category") or "Запчасти").strip(),
            "quantity": qty,
            "min_threshold": int(part_data.get("min_threshold") or 2),
            "purchase_price": float(part_data.get("purchase_price") or 0.0),
            "selling_price": float(part_data.get("selling_price") or 0.0),
            "location": (part_data.get("location") or "").strip(),
            "created_at": now_str
        }
        r = client.post("/parts", json=payload)
        if r.status_code not in (200, 201):
            raise Exception(r.text)
        
        if qty > 0:
            sm_id = get_next_id(client, "stock_movements")
            client.post("/stock_movements", json={
                "id": sm_id,
                "part_id": next_id,
                "type": "incoming",
                "quantity": qty,
                "comment": "Начальный остаток при создании карточки",
                "created_at": now_str
            })

        res = r.json()
        item = res[0] if isinstance(res, list) else res
        item["message"] = "Запчасть добавлена на склад"
        return item

def get_part(part_id: int) -> Dict[str, Any]:
    with get_sb_client() as client:
        r = client.get("/parts", params={"id": f"eq.{part_id}"})
        rows = r.json()
        if not rows:
            raise KeyError("Запчасть не найдена")
        return rows[0]

def update_part(part_id: int, part_data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        payload = {
            "sku": part_data["sku"].strip(),
            "name": part_data["name"].strip(),
            "category": (part_data.get("category") or "Запчасти").strip(),
            "min_threshold": int(part_data.get("min_threshold") or 2),
            "purchase_price": float(part_data.get("purchase_price") or 0.0),
            "selling_price": float(part_data.get("selling_price") or 0.0),
            "location": (part_data.get("location") or "").strip(),
        }
        r = client.patch(f"/parts?id=eq.{part_id}", json=payload)
        if r.status_code not in (200, 204):
            payload["id"] = part_id
            payload["quantity"] = int(part_data.get("quantity") or 0)
            payload["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            client.post("/parts", json=payload, headers={"Prefer": "resolution=merge-duplicates"})
        return {"id": part_id, **payload, "message": "Карточка запчасти обновлена"}

def adjust_part_stock(part_id: int, quantity_change: int, comment: str) -> Dict[str, Any]:
    with get_sb_client() as client:
        p = get_part(part_id)
        current_qty = p.get("quantity", 0)
        new_qty = current_qty + quantity_change
        if new_qty < 0:
            raise ValueError("Остаток не может быть отрицательным!")

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        client.patch(f"/parts?id=eq.{part_id}", json={"quantity": new_qty})

        sm_id = get_next_id(client, "stock_movements")
        m_type = "incoming" if quantity_change > 0 else "outgoing"
        client.post("/stock_movements", json={
            "id": sm_id,
            "part_id": part_id,
            "type": m_type,
            "quantity": abs(quantity_change),
            "comment": comment or "Корректировка остатка",
            "created_at": now_str
        })
        return {"id": part_id, "new_quantity": new_qty, "message": "Остаток успешно изменен"}

def delete_part(part_id: int) -> Dict[str, Any]:
    with get_sb_client() as client:
        client.delete(f"/parts?id=eq.{part_id}")
        return {"id": part_id, "message": "Запчасть удалена"}

def get_stock_movements(limit: int = 50) -> List[Dict[str, Any]]:
    with get_sb_client() as client:
        r = client.get("/stock_movements", params={"select": "*,parts(sku,name)", "order": "id.desc", "limit": str(limit)})
        if r.status_code != 200:
            return []
        items = []
        for m in r.json():
            p = m.get("parts") or {}
            item = dict(m)
            item.pop("parts", None)
            item["part_name"] = p.get("name", "")
            item["part_sku"] = p.get("sku", "")
            items.append(item)
        return items

# ==================== DEALS & KANBAN ====================

def list_deals(stage: Optional[str] = None, q: Optional[str] = None) -> List[Dict[str, Any]]:
    if not SUPABASE_KEY:
        return []
    with get_sb_client() as client:
        params = {
            "select": "*,clients(name,company,phone),equipment(name,serial_vin),deal_parts(quantity)",
            "order": "id.desc"
        }
        if stage and stage != "all":
            params["stage"] = f"eq.{stage}"
        if q:
            term = q.strip()
            params["or"] = f"(title.ilike.*{term}*,responsible.ilike.*{term}*)"

        r = client.get("/deals", params=params)
        if r.status_code != 200:
            return []

        deals = []
        for d in r.json():
            cl = d.get("clients") or {}
            eq = d.get("equipment") or {}
            dp = d.get("deal_parts") or []
            item = dict(d)
            item.pop("clients", None)
            item.pop("equipment", None)
            item.pop("deal_parts", None)
            item["client_name"] = cl.get("name", "")
            item["client_company"] = cl.get("company", "")
            item["client_phone"] = cl.get("phone", "")
            item["equipment_name"] = eq.get("name", "")
            item["equipment_vin"] = eq.get("serial_vin", "")
            item["parts_count"] = sum(p.get("quantity", 0) for p in dp)
            deals.append(item)
        return deals

def create_deal(deal_data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        next_id = get_next_id(client, "deals")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        stage = deal_data.get("stage", "new")
        completed_at = now_str if stage == "completed" else None

        client_id = deal_data.get("client_id") if deal_data.get("client_id") and deal_data.get("client_id") > 0 else None
        eq_id = deal_data.get("equipment_id") if deal_data.get("equipment_id") and deal_data.get("equipment_id") > 0 else None

        payload = {
            "id": next_id,
            "title": deal_data["title"].strip(),
            "client_id": client_id,
            "equipment_id": eq_id,
            "stage": stage,
            "amount": float(deal_data.get("amount") or 0.0),
            "cost": float(deal_data.get("cost") or 0.0),
            "priority": deal_data.get("priority", "normal"),
            "responsible": deal_data.get("responsible", "Мастер-приемщик"),
            "description": (deal_data.get("description") or "").strip(),
            "deadline": deal_data.get("deadline") or None,
            "created_at": now_str,
            "completed_at": completed_at
        }
        r = client.post("/deals", json=payload)
        if r.status_code not in (200, 201):
            raise Exception(r.text)

        # Populate names
        cl_name = ""
        cl_comp = ""
        cl_phone = ""
        if client_id:
            cr = client.get("/clients", params={"id": f"eq.{client_id}"}).json()
            if cr:
                cl_name = cr[0].get("name", "")
                cl_comp = cr[0].get("company", "")
                cl_phone = cr[0].get("phone", "")

        eq_name = ""
        eq_vin = ""
        if eq_id:
            er = client.get("/equipment", params={"id": f"eq.{eq_id}"}).json()
            if er:
                eq_name = er[0].get("name", "")
                eq_vin = er[0].get("serial_vin", "")

        return {
            **payload,
            "client_name": cl_name,
            "client_company": cl_comp,
            "client_phone": cl_phone,
            "equipment_name": eq_name,
            "equipment_vin": eq_vin,
            "parts_count": 0,
            "message": "Сделка/наряд успешно создан"
        }

def get_deal(deal_id: int) -> Dict[str, Any]:
    with get_sb_client() as client:
        r = client.get("/deals", params={"id": f"eq.{deal_id}", "select": "*,clients(name,company,phone,email),equipment(name,serial_vin,operating_hours)"})
        rows = r.json()
        if not rows:
            raise KeyError("Сделка не найдена")
        d = rows[0]
        cl = d.get("clients") or {}
        eq = d.get("equipment") or {}
        d.pop("clients", None)
        d.pop("equipment", None)
        d["client_name"] = cl.get("name", "")
        d["client_company"] = cl.get("company", "")
        d["client_phone"] = cl.get("phone", "")
        d["client_email"] = cl.get("email", "")
        d["equipment_name"] = eq.get("name", "")
        d["equipment_vin"] = eq.get("serial_vin", "")
        d["equipment_hours"] = eq.get("operating_hours", "")

        dpr = client.get("/deal_parts", params={"deal_id": f"eq.{deal_id}", "select": "*,parts(sku,name,category)"})
        parts_list = []
        if dpr.status_code == 200:
            for dp in dpr.json():
                p = dp.get("parts") or {}
                parts_list.append({
                    "deal_part_id": dp.get("id"),
                    "part_id": dp.get("part_id"),
                    "quantity": dp.get("quantity", 1),
                    "purchase_price": dp.get("purchase_price", 0.0),
                    "selling_price": dp.get("selling_price", 0.0),
                    "sku": p.get("sku", f"P-{dp.get('part_id')}"),
                    "part_name": p.get("name", f"Запчасть #{dp.get('part_id')}"),
                    "part_category": p.get("category", "Запчасти")
                })
        d["parts"] = parts_list
        d["parts_count"] = sum(p["quantity"] for p in parts_list)
        return d

def update_deal_stage(deal_id: int, stage: str) -> Dict[str, Any]:
    with get_sb_client() as client:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        completed_at = now_str if stage == "completed" else None
        client.patch(f"/deals?id=eq.{deal_id}", json={
            "stage": stage,
            "completed_at": completed_at
        })
        return {"id": deal_id, "stage": stage, "completed_at": completed_at, "message": "Статус наряда успешно изменен"}

def update_deal(deal_id: int, deal_data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        stage = deal_data.get("stage", "new")
        completed_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S") if stage == "completed" else None
        client_id = deal_data.get("client_id") if deal_data.get("client_id") and deal_data.get("client_id") > 0 else None
        eq_id = deal_data.get("equipment_id") if deal_data.get("equipment_id") and deal_data.get("equipment_id") > 0 else None

        payload = {
            "title": deal_data["title"].strip(),
            "client_id": client_id,
            "equipment_id": eq_id,
            "stage": stage,
            "amount": float(deal_data.get("amount") or 0.0),
            "cost": float(deal_data.get("cost") or 0.0),
            "priority": deal_data.get("priority", "normal"),
            "responsible": deal_data.get("responsible", "Мастер-приемщик"),
            "description": (deal_data.get("description") or "").strip(),
            "deadline": deal_data.get("deadline") or None,
            "completed_at": completed_at
        }
        r = client.patch(f"/deals?id=eq.{deal_id}", json=payload)
        if r.status_code not in (200, 204):
            payload["id"] = deal_id
            payload["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            client.post("/deals", json=payload, headers={"Prefer": "resolution=merge-duplicates"})
        return {"id": deal_id, **payload, "message": "Сделка обновлена"}

def delete_deal(deal_id: int) -> Dict[str, Any]:
    with get_sb_client() as client:
        client.delete(f"/deals?id=eq.{deal_id}")
        return {"id": deal_id, "message": "Сделка удалена"}

def attach_part_to_deal(deal_id: int, part_id: int, quantity: int) -> Dict[str, Any]:
    with get_sb_client() as client:
        # Check part quantity
        p = get_part(part_id)
        if p.get("quantity", 0) < quantity:
            raise ValueError(f"Недостаточно остатка на складе! В наличии: {p.get('quantity', 0)} шт.")

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        dp_id = get_next_id(client, "deal_parts")

        # Insert deal_parts
        client.post("/deal_parts", json={
            "id": dp_id,
            "deal_id": deal_id,
            "part_id": part_id,
            "quantity": quantity,
            "purchase_price": p.get("purchase_price", 0.0),
            "selling_price": p.get("selling_price", 0.0)
        })

        # Deduct part quantity
        new_qty = max(0, p.get("quantity", 0) - quantity)
        client.patch(f"/parts?id=eq.{part_id}", json={"quantity": new_qty})

        # Record stock movement
        sm_id = get_next_id(client, "stock_movements")
        client.post("/stock_movements", json={
            "id": sm_id,
            "part_id": part_id,
            "type": "outgoing",
            "quantity": quantity,
            "deal_id": deal_id,
            "comment": f"Списание на сделку/наряд №{deal_id}",
            "created_at": now_str
        })

        # Recalculate cost
        dp_list = client.get("/deal_parts", params={"deal_id": f"eq.{deal_id}"}).json()
        total_cost = sum(item.get("quantity", 0) * item.get("purchase_price", 0.0) for item in dp_list)
        client.patch(f"/deals?id=eq.{deal_id}", json={"cost": round(total_cost, 2)})

        return {
            "deal_part_id": dp_id,
            "part_id": part_id,
            "new_quantity": new_qty,
            "parts_cost": round(total_cost, 2),
            "parts_count": len(dp_list),
            "message": f"Запчасть «{p.get('name')}» ({quantity} шт.) списана со склада"
        }

def remove_part_from_deal(deal_id: int, deal_part_id: int) -> Dict[str, Any]:
    with get_sb_client() as client:
        dp = client.get("/deal_parts", params={"id": f"eq.{deal_part_id}"}).json()
        if not dp:
            raise KeyError("Прикрепленная запчасть не найдена")
        row = dp[0]
        part_id = row.get("part_id")
        qty = row.get("quantity", 0)

        # Delete deal_part
        client.delete(f"/deal_parts?id=eq.{deal_part_id}")

        # Return stock
        p = get_part(part_id)
        new_qty = p.get("quantity", 0) + qty
        client.patch(f"/parts?id=eq.{part_id}", json={"quantity": new_qty})

        # Recalculate cost
        dp_list = client.get("/deal_parts", params={"deal_id": f"eq.{deal_id}"}).json()
        total_cost = sum(item.get("quantity", 0) * item.get("purchase_price", 0.0) for item in dp_list)
        client.patch(f"/deals?id=eq.{deal_id}", json={"cost": round(total_cost, 2)})

        return {
            "part_id": part_id,
            "new_quantity": new_qty,
            "parts_cost": round(total_cost, 2),
            "parts_count": len(dp_list),
            "message": "Запчасть возвращена на склад"
        }

# ==================== TASKS ====================

def list_tasks(status: Optional[str] = None) -> List[Dict[str, Any]]:
    if not SUPABASE_KEY:
        return []
    with get_sb_client() as client:
        params = {"select": "*,clients(name,company),deals(title)", "order": "due_date.asc"}
        if status and status != "all":
            params["status"] = f"eq.{status}"
        r = client.get("/tasks", params=params)
        if r.status_code != 200:
            return []
        items = []
        for t in r.json():
            cl = t.get("clients") or {}
            dl = t.get("deals") or {}
            item = dict(t)
            item.pop("clients", None)
            item.pop("deals", None)
            item["client_name"] = cl.get("name", "")
            item["client_company"] = cl.get("company", "")
            item["deal_title"] = dl.get("title", "")
            items.append(item)
        return items

def create_task(task_data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        next_id = get_next_id(client, "tasks")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        payload = {
            "id": next_id,
            "title": task_data["title"].strip(),
            "deal_id": task_data.get("deal_id") if task_data.get("deal_id") and task_data.get("deal_id") > 0 else None,
            "client_id": task_data.get("client_id") if task_data.get("client_id") and task_data.get("client_id") > 0 else None,
            "due_date": task_data["due_date"].strip(),
            "priority": task_data.get("priority", "normal"),
            "status": task_data.get("status", "pending"),
            "remind": int(task_data.get("remind", 1)),
            "notes": (task_data.get("notes") or "").strip(),
            "created_at": now_str
        }
        r = client.post("/tasks", json=payload)
        if r.status_code not in (200, 201):
            raise Exception(r.text)
        res = r.json()
        item = res[0] if isinstance(res, list) else res
        item["message"] = "Задача добавлена в планировщик"
        return item

def toggle_task(task_id: int) -> Dict[str, Any]:
    with get_sb_client() as client:
        r = client.get("/tasks", params={"id": f"eq.{task_id}"})
        rows = r.json()
        if not rows:
            raise KeyError("Задача не найдена")
        curr = rows[0].get("status", "pending")
        new_status = "completed" if curr != "completed" else "pending"
        client.patch(f"/tasks?id=eq.{task_id}", json={"status": new_status})
        return {"id": task_id, "status": new_status, "message": "Статус задачи изменен"}

def delete_task(task_id: int) -> Dict[str, Any]:
    with get_sb_client() as client:
        client.delete(f"/tasks?id=eq.{task_id}")
        return {"id": task_id, "message": "Задача удалена"}

# ==================== DASHBOARD METRICS ====================

def get_dashboard_metrics() -> Dict[str, Any]:
    if not SUPABASE_KEY:
        return {
            "total_revenue": 0,
            "net_profit": 0,
            "margin_percent": 0,
            "active_deals_count": 0,
            "total_clients": 0,
            "warehouse_value": 0,
            "critical_parts_count": 0,
            "monthly_data": [],
            "top_clients": [],
            "critical_parts": []
        }
    with get_sb_client() as client:
        deals = client.get("/deals", params={"select": "*,clients(name),equipment(name)", "order": "id.desc"}).json() or []
        completed = [d for d in deals if d.get("stage") == "completed"]
        active = [d for d in deals if d.get("stage") not in ("completed", "cancelled")]

        total_rev = sum(d.get("amount", 0) for d in completed)
        total_cost = sum(d.get("cost", 0) for d in completed)
        net_profit = total_rev - total_cost

        parts = client.get("/parts", params={"select": "*"}).json() or []
        inv_cost = sum(p.get("quantity", 0) * p.get("purchase_price", 0) for p in parts)
        inv_retail = sum(p.get("quantity", 0) * p.get("selling_price", 0) for p in parts)
        low_stock = sum(1 for p in parts if p.get("quantity", 0) <= p.get("min_threshold", 2))

        clients = client.get("/clients", params={"select": "id,name,company"}).json() or []
        equipment = client.get("/equipment", params={"select": "id"}).json() or []
        users = client.get("/users", params={"select": "id"}).json() or []

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        tasks = client.get("/tasks", params={"select": "id,due_date,status"}).json() or []
        overdue = sum(1 for t in tasks if t.get("status") != "completed" and (t.get("due_date") or "") < now_str)

        stages = {}
        for d in deals:
            st = d.get("stage", "new")
            if st not in stages:
                stages[st] = {"count": 0, "amount": 0}
            stages[st]["count"] += 1
            stages[st]["amount"] += d.get("amount", 0)

        # Recent deals format
        recent = []
        for d in deals[:5]:
            cl = d.get("clients") or {}
            eq = d.get("equipment") or {}
            recent.append({
                "id": d.get("id"),
                "title": d.get("title"),
                "amount": d.get("amount"),
                "stage": d.get("stage"),
                "created_at": d.get("created_at"),
                "client_name": cl.get("name", ""),
                "equipment_name": eq.get("name", "")
            })

        return {
            "total_revenue": round(total_rev, 2),
            "total_cost": round(total_cost, 2),
            "net_profit": round(net_profit, 2),
            "margin_percent": round((net_profit / total_rev * 100), 1) if total_rev > 0 else 0,
            "completed_count": len(completed),
            "avg_deal": round(total_rev / len(completed), 2) if completed else 0,
            "active_deals_count": len(active),
            "total_deals_count": len(deals),
            "active_deals_volume": round(sum(d.get("amount", 0) for d in active), 2),
            "total_clients": len(clients),
            "total_equipment": len(equipment),
            "total_users": len(users),
            "low_stock_parts": low_stock,
            "inventory_cost": round(inv_cost, 2),
            "inventory_retail": round(inv_retail, 2),
            "overdue_tasks": overdue,
            "deals_by_stage": stages,
            "recent_deals": recent
        }

# ==================== DUMP & RESTORE ====================

def dump_all_data() -> Dict[str, Any]:
    with get_sb_client() as client:
        data = {}
        for table in ["settings", "users", "clients", "equipment", "parts", "deals", "deal_parts", "tasks", "stock_movements"]:
            r = client.get(f"/{table}", params={"select": "*"})
            data[table] = r.json() if r.status_code == 200 else []
        return data

def restore_all_data(data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        counts = {}
        headers = {"Prefer": "resolution=merge-duplicates"}
        for table in ["settings", "users", "clients", "equipment", "parts", "deals", "deal_parts", "tasks", "stock_movements"]:
            if table in data and isinstance(data[table], list) and data[table]:
                r = client.post(f"/{table}", json=data[table], headers=headers)
                counts[table] = len(data[table]) if r.status_code in (200, 201) else 0
        return counts
