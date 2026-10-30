"""Initialize the local PostgreSQL schema and bootstrap admin."""

import sys
import os

import database


def main() -> int:
    try:
        if not database.get_database_url():
            raise RuntimeError(
                "DATABASE_URL не настроен. Запустите PostgreSQL и проверьте .env."
            )
        if not os.getenv("BOOTSTRAP_ADMIN_USERNAME") or not os.getenv("BOOTSTRAP_ADMIN_PASSWORD"):
            raise RuntimeError(
                "BOOTSTRAP_ADMIN_USERNAME и BOOTSTRAP_ADMIN_PASSWORD должны быть указаны в .env."
            )

        database.initialize_schema()
        database.ensure_bootstrap_admin()
        admin = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "").strip().lower()
        print(f"Готово: локальная PostgreSQL-схема создана/обновлена, администратор '{admin}' готов.")
        return 0
    except Exception as exc:
        print(f"Ошибка инициализации базы: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
