import sqlite3
from contextlib import contextmanager
from pathlib import Path

from app.config import settings


def _migration_sql() -> str:
    migration_path = Path(__file__).resolve().parent.parent / "migrations" / "001_init.sql"
    return migration_path.read_text(encoding="utf-8")


def init_db() -> None:
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        conn.executescript(_migration_sql())
        conn.commit()


@contextmanager
def get_connection():
    conn = sqlite3.connect(settings.database_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()
