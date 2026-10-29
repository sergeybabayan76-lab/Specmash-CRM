"""Initialize the Supabase schema and create the configured bootstrap admin."""

import sys
import os

import database


def main() -> int:
    try:
        if not database.get_database_url():
            raise RuntimeError(
                "SUPABASE_DB_URL не настроен. Укажите Session Pooler URI "
                "из Supabase Project Settings -> Database -> Connection string."
            )
        if not database.get_supabase_key():
            raise RuntimeError("SUPABASE_SECRET_KEY не настроен в .env.")
        if not os.getenv("BOOTSTRAP_ADMIN_USERNAME") or not os.getenv("BOOTSTRAP_ADMIN_PASSWORD"):
            raise RuntimeError(
                "BOOTSTRAP_ADMIN_USERNAME и BOOTSTRAP_ADMIN_PASSWORD должны быть указаны в .env."
            )

        database.initialize_schema()
        database.ensure_bootstrap_admin()
        admin = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "").strip().lower()
        print(f"Готово: схема Supabase создана/обновлена, администратор '{admin}' готов.")
        return 0
    except Exception as exc:
        print(f"Ошибка инициализации базы: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
