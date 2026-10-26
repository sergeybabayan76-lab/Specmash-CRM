"""
Database management and models for СТО Спецмаш CRM.
Powered by Supabase PostgreSQL with high-performance PostgREST client and automatic fallback.
"""

import os
import json
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
    raw_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    if not raw_url:
        for k, v in os.environ.items():
            if "SUPABASE" in k.upper() and ("URL" in k.upper() or "HOST" in k.upper()):
                raw_url = v
                break
    if not raw_url:
        raw_url = "https://wnrnbptadgvmyibszpvk.supabase.co"
    url_match = re.search(r'https://[^\s)\]"\']+', raw_url)
    SUPABASE_URL = url_match.group(0).rstrip("/") if url_match else "https://wnrnbptadgvmyibszpvk.supabase.co"
    return SUPABASE_URL

def get_supabase_key() -> str:
    global SUPABASE_KEY
    if SUPABASE_KEY:
        return SUPABASE_KEY

    # 1. Direct environment variable names
    candidates = [
        "SUPABASE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SECRET",
        "SUPABASE_SECRET_KEY",
        "SB_SECRET",
        "SECRET_COD",
        "SECRET_CODE",
        "SECRET_KEY",
        "SUPABASE_API_KEY",
        "SUPABASE_TOKEN",
        "SUPABASE_SERVICE_KEY",
    ]
    for cand in candidates:
        val = os.getenv(cand)
        if val and len(val.strip().strip("'\"`")) > 10:
            SUPABASE_KEY = val.strip().strip("'\"`")
            break

    # 2. Check normalized environment variable keys (e.g. "secret cod" -> "SECRETCOD")
    if not SUPABASE_KEY:
        for k, v in os.environ.items():
            norm_k = re.sub(r'[^A-Z0-9]', '', k.upper())
            if norm_k in ("SECRETCOD", "SECRETCODE", "SUPABASEKEY", "SUPABASESECRET", "SBSECRET", "SUPABASETOKEN"):
                cleaned = str(v).strip().strip("'\"`")
                if len(cleaned) > 10:
                    SUPABASE_KEY = cleaned
                    break

    # 3. Check values in os.environ that look like Supabase keys (sb_secret_*, sb_publishable_*, eyJhbGci...)
    if not SUPABASE_KEY:
        for k, v in os.environ.items():
            cleaned = str(v).strip().strip("'\"`")
            if cleaned.startswith("sb_secret_") or cleaned.startswith("sb_publishable_") or cleaned.startswith("eyJhbGci"):
                SUPABASE_KEY = cleaned
                break

    # 4. Fallback search for any variable with SUPABASE or SECRET in name
    if not SUPABASE_KEY:
        for k, v in os.environ.items():
            k_upper = k.upper()
            if ("SUPABASE" in k_upper or "SECRET" in k_upper) and "KEY" in k_upper:
                cleaned = str(v).strip().strip("'\"`")
                if len(cleaned) > 20:
                    SUPABASE_KEY = cleaned
                    break

    if SUPABASE_KEY:
        m = re.search(r'(sb_secret_[A-Za-z0-9_\-]+|eyJhbGci[A-Za-z0-9_\-\.]+|[A-Za-z0-9_\-]{20,})', SUPABASE_KEY)
        if m:
            SUPABASE_KEY = m.group(0).strip()

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
            "error": "SUPABASE_KEY не найдена в переменных окружения Vercel",
            "url": url,
            "has_key": False
        }
    try:
        with get_sb_client() as client:
            r = client.get("/settings", params={"select": "key", "limit": "1"})
            if r.status_code == 200:
                return {
                    "connected": True,
                    "status_code": r.status_code,
                    "url": url,
                    "has_key": True,
                    "key_prefix": key[:12] + "..." if len(key) >= 12 else "***"
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
    headers = {
        "Content-Type": "application/json",
        "Prefer": "return=representation",
        "User-Agent": "SpecMash-CRM/FastAPI"
    }
    if key:
        headers["apikey"] = key
        headers["Authorization"] = f"Bearer {key}"
    return httpx.Client(
        base_url=f"{url}/rest/v1",
        headers=headers,
        timeout=20.0
    )

def init_db():
    """Verifies connection to Supabase PostgreSQL and ensures default data."""
    if not get_supabase_key():
        print("[Supabase Warning] SUPABASE_KEY is not set. Please configure SUPABASE_KEY in Vercel or .env.")
        return
    try:
        ensure_default_users()
    except Exception as e:
        print(f"[Supabase Init Warning] {e}")

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

def ensure_default_users():
    admin_user = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
    admin_pass = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")
    mod_user = os.getenv("DEFAULT_MODERATOR_USERNAME", "moderator")
    mod_pass = os.getenv("DEFAULT_MODERATOR_PASSWORD", "mod123")
    mgr_user = os.getenv("DEFAULT_MANAGER_USERNAME", "manager")
    mgr_pass = os.getenv("DEFAULT_MANAGER_PASSWORD", "manager123")
    mech_user = os.getenv("DEFAULT_MECHANIC_USERNAME", "mechanic")
    mech_pass = os.getenv("DEFAULT_MECHANIC_PASSWORD", "mech123")

    defaults = [
        (admin_user, admin_pass, "Иванов Алексей (Администратор)", "admin", "+37499112233"),
        (mod_user, mod_pass, "Смирнова Елена (Модератор)", "moderator", "+37499223344"),
        (mgr_user, mgr_pass, "Мкртчян Армен (Менеджер)", "manager", "+37499445566"),
        (mech_user, mech_pass, "Петров Сергей (Механик)", "mechanic", "+37499334455"),
    ]
    with get_sb_client() as client:
        for u, p, fn, r, ph in defaults:
            existing = client.get("/users", params={"username": f"ilike.{u}"}).json()
            if not existing:
                nid = get_next_id(client, "users")
                h, s = hash_password(p)
                client.post("/users", json={
                    "id": nid, "username": u, "password_hash": h, "salt": s,
                    "full_name": fn, "role": r, "phone": ph,
                    "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                })

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

def save_setting(key: str, value: Any) -> Dict[str, Any]:
    return update_settings({key: value})

def get_system_stats() -> Dict[str, Any]:
    if not SUPABASE_KEY:
        return {
            "version": "1.2.0 (Supabase PostgreSQL)",
            "db_type": "PostgreSQL (Cloud Supabase)",
            "configured": False,
            "message": "Пожалуйста, добавьте SUPABASE_KEY в Vercel Environment Variables",
            "db_size_kb": 0.0,
            "counts": {"clients": 0, "equipment": 0, "parts": 0, "deals": 0, "users": 0, "tasks": 0}
        }
    with get_sb_client() as client:
        def count(table):
            r = client.get(f"/{table}", params={"select": "id"})
            return len(r.json()) if r.status_code == 200 else 0

        return {
            "version": "1.2.0 (Supabase PostgreSQL)",
            "db_type": "PostgreSQL (Cloud Supabase)",
            "db_size_kb": 128.0,
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

def serialize_client_notes(notes: str, inn: str = "", bank_name: str = "", bank_account: str = "") -> str:
    clean_notes = (notes or "").strip()
    clean_notes = re.sub(r'\[CLIENT_REQUISITES:.*?\]', '', clean_notes, flags=re.DOTALL).strip()
    meta = {}
    if inn and str(inn).strip():
        meta["inn"] = str(inn).strip()
    if bank_name and str(bank_name).strip():
        meta["bank_name"] = str(bank_name).strip()
    if bank_account and str(bank_account).strip():
        meta["bank_account"] = str(bank_account).strip()
    if meta:
        meta_str = f"[CLIENT_REQUISITES:{json.dumps(meta, ensure_ascii=False)}]"
        return f"{clean_notes}\n{meta_str}".strip() if clean_notes else meta_str
    return clean_notes

def parse_client_notes(raw_notes: str) -> tuple[str, str, str, str]:
    if not raw_notes:
        return "", "", "", ""
    inn, bank_name, bank_account = "", "", ""
    match = re.search(r'\[CLIENT_REQUISITES:(.*?)\]', raw_notes, flags=re.DOTALL)
    if match:
        try:
            meta = json.loads(match.group(1))
            inn = meta.get("inn", "")
            bank_name = meta.get("bank_name", "")
            bank_account = meta.get("bank_account", "")
        except Exception:
            pass
        clean_notes = re.sub(r'\[CLIENT_REQUISITES:.*?\]', '', raw_notes, flags=re.DOTALL).strip()
        return clean_notes, inn, bank_name, bank_account

    m_inn = re.search(r'(?:ИНН|TIN)[:\s]+([0-9A-Za-z]+)', raw_notes, re.IGNORECASE)
    if m_inn:
        inn = m_inn.group(1).strip()
    m_bank = re.search(r'(?:Банк|Название банка)[:\s]+([^\n\r,]+)', raw_notes, re.IGNORECASE)
    if m_bank:
        bank_name = m_bank.group(1).strip()
    m_acc = re.search(r'(?:Счет|Счёт|Р/с|Р/С|IBAN)[:\s]+([0-9A-Za-z\s]+)', raw_notes, re.IGNORECASE)
    if m_acc:
        bank_account = m_acc.group(1).strip()

    return raw_notes.strip(), inn, bank_name, bank_account

def list_clients(q: Optional[str] = None) -> List[Dict[str, Any]]:
    if not get_supabase_key():
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
            clean_notes, inn, bank_name, bank_account = parse_client_notes(item.get("notes") or "")
            item["notes"] = clean_notes
            item["inn"] = inn
            item["bank_name"] = bank_name
            item["bank_account"] = bank_account
            item["equipment_count"] = eq_count
            item["deals_count"] = deals_count
            item["total_revenue"] = total_rev
            clients.append(item)
        return clients

def create_client(client_data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        next_id = get_next_id(client, "clients")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        serialized_notes = serialize_client_notes(
            client_data.get("notes") or "",
            inn=client_data.get("inn") or "",
            bank_name=client_data.get("bank_name") or "",
            bank_account=client_data.get("bank_account") or ""
        )
        payload = {
            "id": next_id,
            "name": client_data["name"].strip(),
            "company": (client_data.get("company") or "").strip(),
            "phone": client_data["phone"].strip(),
            "email": (client_data.get("email") or "").strip(),
            "address": (client_data.get("address") or "").strip(),
            "notes": serialized_notes,
            "created_at": now_str
        }
        r = client.post("/clients", json=payload)
        if r.status_code not in (200, 201):
            raise Exception(r.text)
        res = r.json()
        item = res[0] if isinstance(res, list) else res
        item["inn"] = client_data.get("inn") or ""
        item["bank_name"] = client_data.get("bank_name") or ""
        item["bank_account"] = client_data.get("bank_account") or ""
        item["notes"] = (client_data.get("notes") or "").strip()
        item["message"] = "Клиент успешно добавлен"
        return item

def get_crm_client(client_id: int) -> Dict[str, Any]:
    with get_sb_client() as client:
        r = client.get("/clients", params={"id": f"eq.{client_id}", "select": "*"})
        rows = r.json()
        if not rows:
            raise KeyError("Клиент не найден")
        c = rows[0]
        clean_notes, inn, bank_name, bank_account = parse_client_notes(c.get("notes") or "")
        c["notes"] = clean_notes
        c["inn"] = inn
        c["bank_name"] = bank_name
        c["bank_account"] = bank_account

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
        existing_r = client.get("/clients", params={"id": f"eq.{client_id}", "select": "notes"})
        existing_notes = ""
        if existing_r.status_code == 200 and existing_r.json():
            existing_notes = existing_r.json()[0].get("notes") or ""
        old_clean, old_inn, old_bank, old_acc = parse_client_notes(existing_notes)

        new_inn = client_data.get("inn") if "inn" in client_data and client_data["inn"] is not None else old_inn
        new_bank = client_data.get("bank_name") if "bank_name" in client_data and client_data["bank_name"] is not None else old_bank
        new_acc = client_data.get("bank_account") if "bank_account" in client_data and client_data["bank_account"] is not None else old_acc
        new_notes_raw = client_data.get("notes") if "notes" in client_data and client_data["notes"] is not None else old_clean

        serialized_notes = serialize_client_notes(new_notes_raw, inn=new_inn, bank_name=new_bank, bank_account=new_acc)

        payload = {
            "name": client_data["name"].strip(),
            "company": (client_data.get("company") or "").strip(),
            "phone": client_data["phone"].strip(),
            "email": (client_data.get("email") or "").strip(),
            "address": (client_data.get("address") or "").strip(),
            "notes": serialized_notes,
        }
        r = client.patch(f"/clients?id=eq.{client_id}", json=payload)
        if r.status_code not in (200, 204):
            payload["id"] = client_id
            payload["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            client.post("/clients", json=payload, headers={"Prefer": "resolution=merge-duplicates"})
        return {
            "id": client_id,
            **payload,
            "inn": new_inn,
            "bank_name": new_bank,
            "bank_account": new_acc,
            "notes": new_notes_raw,
            "message": "Данные клиента обновлены"
        }

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

def serialize_deal_description(description: str, deal_type: str = "service", service_type: str = "service", closing_outcome: str = "success") -> str:
    clean_desc = (description or "").strip()
    clean_desc = re.sub(r'\[DEAL_TYPE:.*?\]', '', clean_desc, flags=re.DOTALL).strip()
    clean_desc = re.sub(r'\[SERVICE_TYPE:.*?\]', '', clean_desc, flags=re.DOTALL).strip()
    clean_desc = re.sub(r'\[OUTCOME:.*?\]', '', clean_desc, flags=re.DOTALL).strip()
    tags = []
    dtype = (deal_type or "service").strip().lower()
    if dtype in ("parts_sale", "sales"):
        tags.append(f"[DEAL_TYPE:{dtype}]")
    stype = (service_type or "service").strip().lower()
    if stype in ("service", "pre_sale", "warranty"):
        tags.append(f"[SERVICE_TYPE:{stype}]")
    outcome = (closing_outcome or "success").strip().lower()
    if outcome in ("success", "failed"):
        tags.append(f"[OUTCOME:{outcome}]")
    if tags:
        tag_str = "\n".join(tags)
        return f"{clean_desc}\n{tag_str}".strip() if clean_desc else tag_str
    return clean_desc

def parse_deal_description(raw_description: str, title: str = "") -> tuple[str, str, str, str]:
    deal_type = "service"
    service_type = "service"
    closing_outcome = "success"
    clean_desc = (raw_description or "").strip()

    if not clean_desc:
        if title and any(term in title.lower() for term in ("продажа запчаст", "продажа з/ч", "заказ запчаст", "реализация з/ч", "отгрузка з/ч")):
            deal_type = "parts_sale"
        elif title and any(term in title.lower() for term in ("продажа спецтехники", "продажа техники", "отдел продаж")):
            deal_type = "sales"
        return "", deal_type, service_type, closing_outcome

    m_dtype = re.search(r'\[DEAL_TYPE:(.*?)\]', clean_desc, flags=re.DOTALL)
    if m_dtype:
        deal_type = m_dtype.group(1).strip().lower()
        clean_desc = re.sub(r'\[DEAL_TYPE:.*?\]', '', clean_desc, flags=re.DOTALL).strip()
    elif title and any(term in title.lower() for term in ("продажа запчаст", "продажа з/ч", "заказ запчаст", "реализация з/ч", "отгрузка з/ч")):
        deal_type = "parts_sale"
    elif title and any(term in title.lower() for term in ("продажа спецтехники", "продажа техники", "отдел продаж")):
        deal_type = "sales"

    m_stype = re.search(r'\[SERVICE_TYPE:(.*?)\]', clean_desc, flags=re.DOTALL)
    if m_stype:
        service_type = m_stype.group(1).strip().lower()
        clean_desc = re.sub(r'\[SERVICE_TYPE:.*?\]', '', clean_desc, flags=re.DOTALL).strip()

    m_outcome = re.search(r'\[OUTCOME:(.*?)\]', clean_desc, flags=re.DOTALL)
    if m_outcome:
        closing_outcome = m_outcome.group(1).strip().lower()
        clean_desc = re.sub(r'\[OUTCOME:.*?\]', '', clean_desc, flags=re.DOTALL).strip()

    return clean_desc, deal_type, service_type, closing_outcome

def list_deals(stage: Optional[str] = None, q: Optional[str] = None, deal_type: Optional[str] = None) -> List[Dict[str, Any]]:
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
            clean_desc, dtype, stype, outcome = parse_deal_description(d.get("description") or "", d.get("title") or "")
            if deal_type and deal_type != "all" and dtype != deal_type:
                continue
            item["description"] = clean_desc
            item["deal_type"] = dtype
            item["service_type"] = stype
            item["closing_outcome"] = outcome
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
        completed_at = now_str if stage in ("ready", "completed") else None

        client_id = deal_data.get("client_id") if deal_data.get("client_id") and deal_data.get("client_id") > 0 else None
        eq_id = deal_data.get("equipment_id") if deal_data.get("equipment_id") and deal_data.get("equipment_id") > 0 else None
        deal_type = (deal_data.get("deal_type") or "service").strip().lower()
        service_type = (deal_data.get("service_type") or "service").strip().lower()
        closing_outcome = (deal_data.get("closing_outcome") or "success").strip().lower()
        serialized_desc = serialize_deal_description(deal_data.get("description") or "", deal_type=deal_type, service_type=service_type, closing_outcome=closing_outcome)

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
            "description": serialized_desc,
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
            "description": (deal_data.get("description") or "").strip(),
            "deal_type": deal_type,
            "service_type": service_type,
            "closing_outcome": closing_outcome,
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
        clean_desc, dtype, stype, outcome = parse_deal_description(d.get("description") or "", d.get("title") or "")
        d["description"] = clean_desc
        d["deal_type"] = dtype
        d["service_type"] = stype
        d["closing_outcome"] = outcome
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
        patch_payload = {"stage": stage}
        if stage in ("ready", "completed"):
            patch_payload["completed_at"] = now_str
        client.patch(f"/deals?id=eq.{deal_id}", json=patch_payload)
        return {"id": deal_id, "stage": stage, "completed_at": patch_payload.get("completed_at"), "message": "Статус наряда успешно изменен"}

def update_deal(deal_id: int, deal_data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        stage = deal_data.get("stage", "new")
        completed_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S") if stage in ("ready", "completed") else None
        client_id = deal_data.get("client_id") if deal_data.get("client_id") and deal_data.get("client_id") > 0 else None
        eq_id = deal_data.get("equipment_id") if deal_data.get("equipment_id") and deal_data.get("equipment_id") > 0 else None

        existing_r = client.get("/deals", params={"id": f"eq.{deal_id}", "select": "description,title,completed_at,created_at"})
        existing_desc = ""
        existing_title = ""
        existing_completed_at = None
        if existing_r.status_code == 200 and existing_r.json():
            row = existing_r.json()[0]
            existing_desc = row.get("description") or ""
            existing_title = row.get("title") or ""
            existing_completed_at = row.get("completed_at")
        old_desc, old_dtype, old_stype, old_outcome = parse_deal_description(existing_desc, existing_title)
        new_dtype = (deal_data.get("deal_type") or old_dtype or "service").strip().lower()
        new_stype = (deal_data.get("service_type") or old_stype or "service").strip().lower()
        new_outcome = (deal_data.get("closing_outcome") or old_outcome or "success").strip().lower()
        raw_desc = deal_data.get("description") if "description" in deal_data and deal_data["description"] is not None else old_desc
        serialized_desc = serialize_deal_description(raw_desc or "", deal_type=new_dtype, service_type=new_stype, closing_outcome=new_outcome)

        if stage in ("ready", "completed"):
            completed_at = existing_completed_at or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        else:
            completed_at = None

        payload = {
            "title": deal_data["title"].strip(),
            "client_id": client_id,
            "equipment_id": eq_id,
            "stage": stage,
            "amount": float(deal_data.get("amount") or 0.0),
            "cost": float(deal_data.get("cost") or 0.0),
            "priority": deal_data.get("priority", "normal"),
            "responsible": deal_data.get("responsible", "Мастер-приемщик"),
            "description": serialized_desc,
            "deadline": deal_data.get("deadline") or None,
            "completed_at": completed_at
        }
        r = client.patch(f"/deals?id=eq.{deal_id}", json=payload)
        if r.status_code not in (200, 204):
            payload["id"] = deal_id
            payload["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            client.post("/deals", json=payload, headers={"Prefer": "resolution=merge-duplicates"})
        return {"id": deal_id, **payload, "description": raw_desc, "deal_type": new_dtype, "service_type": new_stype, "closing_outcome": new_outcome, "message": "Сделка обновлена"}

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

def serialize_task_notes(notes: str, responsible: Optional[str] = None) -> str:
    base = notes or ""
    base = re.sub(r'\[RESPONSIBLE:[^\]]*\]', '', base).strip()
    if responsible and responsible.strip():
        tag = f"[RESPONSIBLE:{responsible.strip()}]"
        return f"{base}\n{tag}".strip() if base else tag
    return base

def parse_task_notes(raw_notes: str) -> tuple[str, str]:
    if not raw_notes:
        return "", ""
    m = re.search(r'\[RESPONSIBLE:([^\]]+)\]', raw_notes)
    responsible = m.group(1).strip() if m else ""
    clean_notes = re.sub(r'\[RESPONSIBLE:[^\]]*\]', '', raw_notes).strip()
    return clean_notes, responsible

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
            clean_notes, resp = parse_task_notes(item.get("notes") or "")
            item["notes"] = clean_notes
            item["responsible"] = resp
            item["client_name"] = cl.get("name", "")
            item["client_company"] = cl.get("company", "")
            item["deal_title"] = dl.get("title", "")
            items.append(item)
        return items

def create_task(task_data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        next_id = get_next_id(client, "tasks")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        raw_notes = (task_data.get("notes") or "").strip()
        responsible = (task_data.get("responsible") or "").strip()
        serialized_notes = serialize_task_notes(raw_notes, responsible)
        payload = {
            "id": next_id,
            "title": task_data["title"].strip(),
            "deal_id": task_data.get("deal_id") if task_data.get("deal_id") and task_data.get("deal_id") > 0 else None,
            "client_id": task_data.get("client_id") if task_data.get("client_id") and task_data.get("client_id") > 0 else None,
            "due_date": task_data["due_date"].strip(),
            "priority": task_data.get("priority", "normal"),
            "status": task_data.get("status", "pending"),
            "remind": int(task_data.get("remind", 1)),
            "notes": serialized_notes,
            "created_at": now_str
        }
        r = client.post("/tasks", json=payload)
        if r.status_code not in (200, 201):
            raise Exception(r.text)
        res = r.json()
        item = res[0] if isinstance(res, list) else res
        item["responsible"] = responsible
        item["notes"] = raw_notes
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

def update_task(task_id: int, task_data: Dict[str, Any]) -> Dict[str, Any]:
    with get_sb_client() as client:
        r = client.get("/tasks", params={"id": f"eq.{task_id}"})
        rows = r.json()
        if not rows:
            raise KeyError("Задача не найдена")

        existing = rows[0]
        old_notes, old_resp = parse_task_notes(existing.get("notes") or "")
        raw_notes = task_data.get("notes") if "notes" in task_data and task_data["notes"] is not None else old_notes
        responsible = task_data.get("responsible") if "responsible" in task_data and task_data["responsible"] is not None else old_resp
        serialized_notes = serialize_task_notes((raw_notes or "").strip(), (responsible or "").strip())

        payload: Dict[str, Any] = {"notes": serialized_notes}
        if "title" in task_data and task_data["title"]:
            payload["title"] = task_data["title"].strip()
        if "due_date" in task_data and task_data["due_date"]:
            payload["due_date"] = task_data["due_date"].strip()
        if "priority" in task_data and task_data["priority"]:
            payload["priority"] = task_data["priority"]
        if "status" in task_data and task_data["status"]:
            payload["status"] = task_data["status"]
        if "deal_id" in task_data:
            payload["deal_id"] = task_data["deal_id"] if task_data["deal_id"] and task_data["deal_id"] > 0 else None
        if "client_id" in task_data:
            payload["client_id"] = task_data["client_id"] if task_data["client_id"] and task_data["client_id"] > 0 else None
        if "remind" in task_data and task_data["remind"] is not None:
            payload["remind"] = int(task_data["remind"])

        client.patch(f"/tasks?id=eq.{task_id}", json=payload)
        return {
            "id": task_id,
            "message": "Задача успешно обновлена",
            "responsible": responsible,
            "notes": raw_notes
        }

def delete_task(task_id: int) -> Dict[str, Any]:
    with get_sb_client() as client:
        client.delete(f"/tasks?id=eq.{task_id}")
        return {"id": task_id, "message": "Задача удалена"}

# ==================== DASHBOARD METRICS ====================

def _to_float(v: Any, default: float = 0.0) -> float:
    try:
        if v is None:
            return default
        return float(v)
    except (ValueError, TypeError):
        return default

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
            "low_stock_parts": 0,
            "monthly_data": [],
            "top_clients": [],
            "critical_parts": [],
            "mechanics_revenue": []
        }
    with get_sb_client() as client:
        deals = client.get("/deals", params={"select": "*,clients(name),equipment(name)", "order": "id.desc"}).json() or []
        for d in deals:
            _, dtype = parse_deal_description(d.get("description") or "", d.get("title") or "")
            d["deal_type"] = dtype

        completed = [d for d in deals if d.get("stage") == "completed"]
        active = [d for d in deals if d.get("stage") not in ("completed", "cancelled")]

        # Requirement #2: Separate Revenue Calculation for Parts Sales & Service
        service_completed = [d for d in completed if d.get("deal_type") != "parts_sale"]
        service_active = [d for d in active if d.get("deal_type") != "parts_sale"]
        service_rev = sum(_to_float(d.get("amount")) for d in service_completed)
        service_cost = sum(_to_float(d.get("cost")) for d in service_completed)
        service_profit = service_rev - service_cost

        parts_completed = [d for d in completed if d.get("deal_type") == "parts_sale"]
        parts_active = [d for d in active if d.get("deal_type") == "parts_sale"]
        parts_rev = sum(_to_float(d.get("amount")) for d in parts_completed)
        parts_cost = sum(_to_float(d.get("cost")) for d in parts_completed)
        parts_profit = parts_rev - parts_cost

        total_rev = service_rev + parts_rev
        total_cost = service_cost + parts_cost
        net_profit = total_rev - total_cost

        # Requirement #5: Fix critical warehouse parts display
        parts = client.get("/parts", params={"select": "*"}).json() or []
        inv_cost = 0.0
        inv_retail = 0.0
        critical_list = []
        for p in parts:
            qty = _to_float(p.get("quantity"), 0.0)
            p_price = _to_float(p.get("purchase_price"), 0.0)
            s_price = _to_float(p.get("selling_price"), 0.0)
            min_th = _to_float(p.get("min_threshold"), 2.0)
            inv_cost += qty * p_price
            inv_retail += qty * s_price
            if qty <= min_th:
                critical_list.append({
                    "id": p.get("id"),
                    "name": p.get("name") or "Без названия",
                    "sku": p.get("sku") or "—",
                    "category": p.get("category") or "",
                    "quantity": int(qty) if qty.is_integer() else round(qty, 2),
                    "min_threshold": int(min_th) if min_th.is_integer() else round(min_th, 2),
                    "location": p.get("location") or "Склад",
                    "purchase_price": round(p_price, 2),
                    "selling_price": round(s_price, 2)
                })

        # Sort by quantity ascending so the lowest stock (most deficit) items are at top
        critical_list.sort(key=lambda x: x["quantity"])
        low_stock = len(critical_list)

        clients = client.get("/clients", params={"select": "id,name,company"}).json() or []
        equipment = client.get("/equipment", params={"select": "id"}).json() or []
        users = client.get("/users", params={"select": "id,username,full_name,role,phone"}).json() or []

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        tasks = client.get("/tasks", params={"select": "id,due_date,status"}).json() or []
        overdue = sum(1 for t in tasks if t.get("status") != "completed" and (t.get("due_date") or "") < now_str)

        stages = {}
        for d in deals:
            st = d.get("stage", "new")
            if st not in stages:
                stages[st] = {"count": 0, "amount": 0.0}
            stages[st]["count"] += 1
            stages[st]["amount"] += _to_float(d.get("amount"))

        # Recent deals format
        recent = []
        for d in deals[:6]:
            cl = d.get("clients") or {}
            eq = d.get("equipment") or {}
            clean_desc, dtype = parse_deal_description(d.get("description") or "", d.get("title") or "")
            recent.append({
                "id": d.get("id"),
                "title": d.get("title"),
                "deal_type": dtype,
                "amount": d.get("amount"),
                "stage": d.get("stage"),
                "created_at": d.get("created_at"),
                "completed_at": d.get("completed_at"),
                "client_name": cl.get("name", ""),
                "equipment_name": eq.get("name", "")
            })

        # Requirement #8: Mechanics revenue calculation (Admin only)
        mechanics_map: Dict[str, Dict[str, Any]] = {}
        for u in users:
            if u.get("role") == "mechanic":
                uid = str(u.get("id"))
                mechanics_map[uid] = {
                    "user_id": u.get("id"),
                    "name": u.get("full_name") or u.get("username"),
                    "username": u.get("username") or "",
                    "completed_deals_count": 0,
                    "active_deals_count": 0,
                    "total_revenue": 0.0,
                    "total_cost": 0.0,
                    "net_profit": 0.0,
                    "avg_deal": 0.0
                }

        for d in deals:
            if d.get("deal_type") == "parts_sale":
                continue
            resp = (d.get("responsible") or "").strip()
            if not resp:
                continue

            matched_key = None
            resp_lower = resp.lower()
            for mid, mdata in mechanics_map.items():
                m_name = mdata["name"].lower()
                m_user = mdata["username"].lower()
                if resp_lower == m_name or resp_lower == m_user or resp_lower in m_name or m_name in resp_lower:
                    matched_key = mid
                    break

            if not matched_key:
                matched_key = f"resp_{resp}"
                if matched_key not in mechanics_map:
                    mechanics_map[matched_key] = {
                        "user_id": None,
                        "name": resp,
                        "username": resp,
                        "completed_deals_count": 0,
                        "active_deals_count": 0,
                        "total_revenue": 0.0,
                        "total_cost": 0.0,
                        "net_profit": 0.0,
                        "avg_deal": 0.0
                    }

            entry = mechanics_map[matched_key]
            d_amt = _to_float(d.get("amount"), 0.0)
            d_cost = _to_float(d.get("cost"), 0.0)

            if d.get("stage") == "completed":
                entry["completed_deals_count"] += 1
                entry["total_revenue"] += d_amt
                entry["total_cost"] += d_cost
            elif d.get("stage") not in ("completed", "cancelled"):
                entry["active_deals_count"] += 1

        mechanics_revenue = list(mechanics_map.values())
        for m in mechanics_revenue:
            m["net_profit"] = round(m["total_revenue"] - m["total_cost"], 2)
            m["total_revenue"] = round(m["total_revenue"], 2)
            m["total_cost"] = round(m["total_cost"], 2)
            m["avg_deal"] = round(m["total_revenue"] / m["completed_deals_count"], 2) if m["completed_deals_count"] > 0 else 0.0

        mechanics_revenue.sort(key=lambda x: (x["total_revenue"], x["completed_deals_count"]), reverse=True)

        return {
            "total_revenue": round(total_rev, 2),
            "total_cost": round(total_cost, 2),
            "net_profit": round(net_profit, 2),
            "margin_percent": round((net_profit / total_rev * 100), 1) if total_rev > 0 else 0,
            
            # Parts Sales revenue metrics (Requirement #2)
            "parts_sales_revenue": round(parts_rev, 2),
            "parts_sales_cost": round(parts_cost, 2),
            "parts_sales_profit": round(parts_profit, 2),
            "parts_sales_margin": round((parts_profit / parts_rev * 100), 1) if parts_rev > 0 else 0,
            "parts_sales_count": len([d for d in deals if d.get("deal_type") == "parts_sale"]),
            "parts_sales_completed_count": len(parts_completed),
            "parts_sales_active_count": len(parts_active),
            "parts_sales_active_volume": round(sum(_to_float(d.get("amount")) for d in parts_active), 2),

            # Service revenue metrics
            "service_revenue": round(service_rev, 2),
            "service_cost": round(service_cost, 2),
            "service_profit": round(service_profit, 2),
            "service_margin": round((service_profit / service_rev * 100), 1) if service_rev > 0 else 0,
            "service_deals_count": len([d for d in deals if d.get("deal_type") != "parts_sale"]),
            "service_completed_count": len(service_completed),
            "service_active_count": len(service_active),
            "service_active_volume": round(sum(_to_float(d.get("amount")) for d in service_active), 2),

            "completed_count": len(completed),
            "avg_deal": round(total_rev / len(completed), 2) if completed else 0,
            "active_deals_count": len(active),
            "total_deals_count": len(deals),
            "active_deals_volume": round(sum(_to_float(d.get("amount")) for d in active), 2),
            "total_clients": len(clients),
            "total_equipment": len(equipment),
            "total_users": len(users),
            "low_stock_parts": low_stock,
            "critical_parts": critical_list[:25],
            "mechanics_revenue": mechanics_revenue,
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


# ==================== TOP SOLD PARTS & EQUIPMENT HISTORY & PERMISSIONS & WHATSAPP ====================

def get_top_sold_parts(limit: int = 10) -> List[Dict[str, Any]]:
    if not SUPABASE_KEY:
        return []
    with get_sb_client() as client:
        dpr = client.get("/deal_parts", params={"select": "part_id,quantity,selling_price"})
        parts_r = client.get("/parts", params={"select": "id,sku,name,category,quantity,selling_price,min_threshold"})
        if parts_r.status_code != 200:
            return []

        parts_map = {p["id"]: p for p in parts_r.json()}
        sales_agg: Dict[int, Dict[str, Any]] = {}

        if dpr.status_code == 200:
            for dp in dpr.json():
                pid = dp.get("part_id")
                qty = dp.get("quantity") or 0
                price = dp.get("selling_price") or 0.0
                if pid not in sales_agg:
                    sales_agg[pid] = {"sold_count": 0, "total_revenue": 0.0}
                sales_agg[pid]["sold_count"] += qty
                sales_agg[pid]["total_revenue"] += qty * price

        results = []
        for pid, p in parts_map.items():
            agg = sales_agg.get(pid, {"sold_count": 0, "total_revenue": 0.0})
            results.append({
                "part_id": pid,
                "sku": p.get("sku") or f"P-{pid}",
                "name": p.get("name") or f"Запчасть #{pid}",
                "category": p.get("category") or "Запчасти",
                "current_stock": p.get("quantity") or 0,
                "sold_count": agg["sold_count"],
                "total_revenue": agg["total_revenue"],
                "unit_price": p.get("selling_price") or 0.0
            })

        results.sort(key=lambda x: (x["sold_count"], x["total_revenue"], x["unit_price"]), reverse=True)
        return results[:limit]

def get_equipment_history(eq_id: int) -> Dict[str, Any]:
    if not SUPABASE_KEY:
        return {"equipment_id": eq_id, "deals": [], "parts": [], "total_deals": 0, "total_spent": 0.0, "total_parts_count": 0}
    with get_sb_client() as client:
        r = client.get("/deals", params={"equipment_id": f"eq.{eq_id}", "select": "*,clients(name,company,phone)", "order": "created_at.desc"})
        deals_raw = r.json() if r.status_code == 200 else []
        deals = []
        deal_ids = []
        total_spent = 0.0

        for d in deals_raw:
            cl = d.get("clients") or {}
            item = dict(d)
            item.pop("clients", None)
            clean_desc, dtype, stype, outcome = parse_deal_description(d.get("description") or "", d.get("title") or "")
            item["description"] = clean_desc
            item["deal_type"] = dtype
            item["service_type"] = stype
            item["closing_outcome"] = outcome
            item["client_name"] = cl.get("name", "")
            item["client_company"] = cl.get("company", "")
            item["client_phone"] = cl.get("phone", "")
            deals.append(item)
            deal_ids.append(str(d.get("id")))
            total_spent += float(d.get("amount") or 0.0)

        parts = []
        if deal_ids:
            dpr = client.get("/deal_parts", params={"deal_id": f"in.({','.join(deal_ids)})", "select": "*,parts(sku,name,category)"})
            if dpr.status_code == 200:
                for dp in dpr.json():
                    p = dp.get("parts") or {}
                    deal_obj = next((dl for dl in deals if dl.get("id") == dp.get("deal_id")), None)
                    parts.append({
                        "deal_part_id": dp.get("id"),
                        "deal_id": dp.get("deal_id"),
                        "deal_title": deal_obj.get("title", f"Наряд #{dp.get('deal_id')}") if deal_obj else f"Наряд #{dp.get('deal_id')}",
                        "date": deal_obj.get("created_at", "") if deal_obj else "",
                        "part_id": dp.get("part_id"),
                        "sku": p.get("sku") or f"P-{dp.get('part_id')}",
                        "name": p.get("name") or f"Запчасть #{dp.get('part_id')}",
                        "category": p.get("category") or "Запчасти",
                        "quantity": dp.get("quantity") or 1,
                        "purchase_price": float(dp.get("purchase_price") or 0.0),
                        "selling_price": float(dp.get("selling_price") or 0.0),
                        "total_price": float(dp.get("selling_price") or 0.0) * float(dp.get("quantity") or 1)
                    })

        return {
            "equipment_id": eq_id,
            "deals": deals,
            "parts": parts,
            "total_deals": len(deals),
            "total_spent": total_spent,
            "total_parts_count": sum(p["quantity"] for p in parts)
        }

DEFAULT_ROLE_PERMISSIONS = {
    "admin": {
        "dashboard": True, "deals_sto": True, "deals_parts": True, "deals_sales": True,
        "warehouse": True, "equipment": True, "clients": True, "tasks": True,
        "marketing": True, "users": True, "settings": True,
        "can_delete_deals": True, "can_edit_closed_deals": True,
        "can_view_revenue": True, "can_edit_tasks": True
    },
    "moderator": {
        "dashboard": True, "deals_sto": True, "deals_parts": True, "deals_sales": False,
        "warehouse": True, "equipment": True, "clients": True, "tasks": True,
        "marketing": True, "users": False, "settings": False,
        "can_delete_deals": False, "can_edit_closed_deals": False,
        "can_view_revenue": True, "can_edit_tasks": False
    },
    "manager": {
        "dashboard": True, "deals_sto": True, "deals_parts": True, "deals_sales": False,
        "warehouse": True, "equipment": True, "clients": True, "tasks": True,
        "marketing": False, "users": False, "settings": False,
        "can_delete_deals": False, "can_edit_closed_deals": False,
        "can_view_revenue": False, "can_edit_tasks": False
    },
    "sales_manager": {
        "dashboard": True, "deals_sto": False, "deals_parts": False, "deals_sales": True,
        "warehouse": True, "equipment": True, "clients": True, "tasks": True,
        "marketing": True, "users": False, "settings": False,
        "can_delete_deals": False, "can_edit_closed_deals": False,
        "can_view_revenue": False, "can_edit_tasks": False
    },
    "mechanic": {
        "dashboard": False, "deals_sto": True, "deals_parts": False, "deals_sales": False,
        "warehouse": True, "equipment": True, "clients": False, "tasks": True,
        "marketing": False, "users": False, "settings": False,
        "can_delete_deals": False, "can_edit_closed_deals": False,
        "can_view_revenue": False, "can_edit_tasks": False
    }
}

def get_user_permissions(user_id: int, role: str = "mechanic") -> Dict[str, Any]:
    base_perms = dict(DEFAULT_ROLE_PERMISSIONS.get(role, DEFAULT_ROLE_PERMISSIONS["mechanic"]))
    if not SUPABASE_KEY:
        return base_perms
    with get_sb_client() as client:
        r = client.get("/settings", params={"key": f"eq.user_perms_{user_id}"})
        if r.status_code == 200 and r.json():
            val = r.json()[0].get("value")
            if val:
                try:
                    custom = json.loads(val) if isinstance(val, str) else val
                    base_perms.update(custom)
                except Exception:
                    pass
    return base_perms

def save_user_permissions(user_id: int, permissions: Dict[str, Any]) -> Dict[str, Any]:
    save_setting(f"user_perms_{user_id}", json.dumps(permissions, ensure_ascii=False))
    return {"user_id": user_id, "permissions": permissions, "message": "Права доступа сотрудника сохранены"}

def send_whatsapp_message(to_phone: str, message_text: str, template_name: Optional[str] = None) -> Dict[str, Any]:
    settings = get_settings()
    phone_id = (settings.get("whatsapp_phone_number_id") or "").strip()
    token = (settings.get("whatsapp_access_token") or "").strip()
    clean_phone = re.sub(r'[^0-9+]', '', to_phone)
    if clean_phone.startswith('+'):
        clean_phone = clean_phone[1:]

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = {
        "phone": to_phone,
        "clean_phone": clean_phone,
        "text": message_text,
        "template": template_name,
        "sent_at": now_str,
        "status": "pending",
        "detail": ""
    }

    if not phone_id or not token or token == "EAAGdummyTokenTest" or phone_id == "1234567890":
        log_entry["status"] = "simulated"
        log_entry["detail"] = "Режим симуляции: настройте WhatsApp Cloud API в разделе 'Маркетинг'"
        save_whatsapp_log(log_entry)
        return {"success": True, "simulated": True, "log": log_entry}

    url = f"https://graph.facebook.com/v19.0/{phone_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": clean_phone,
        "type": "text",
        "text": {"preview_url": False, "body": message_text}
    }
    try:
        with httpx.Client(timeout=15.0) as http_client:
            resp = http_client.post(url, headers=headers, json=payload)
            if resp.status_code in (200, 201):
                log_entry["status"] = "sent"
                log_entry["detail"] = resp.text
                save_whatsapp_log(log_entry)
                return {"success": True, "simulated": False, "log": log_entry}
            else:
                log_entry["status"] = "failed"
                log_entry["detail"] = f"HTTP {resp.status_code}: {resp.text}"
                save_whatsapp_log(log_entry)
                return {"success": False, "simulated": False, "error": log_entry["detail"]}
    except Exception as e:
        log_entry["status"] = "failed"
        log_entry["detail"] = str(e)
        save_whatsapp_log(log_entry)
        return {"success": False, "simulated": False, "error": str(e)}

def get_whatsapp_logs() -> List[Dict[str, Any]]:
    settings = get_settings()
    raw = settings.get("whatsapp_logs_json") or "[]"
    try:
        return json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return []

def save_whatsapp_log(entry: Dict[str, Any]) -> None:
    logs = get_whatsapp_logs()
    logs.insert(0, entry)
    logs = logs[:100]
    save_setting("whatsapp_logs_json", json.dumps(logs, ensure_ascii=False))
