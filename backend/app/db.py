"""SQLite connection helpers."""

import sqlite3
from pathlib import Path

from app.config import DB_PATH, SCHEMA_PATH


def connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    # check_same_thread=False because FastAPI runs a synchronous dependency's setup
    # and its teardown on different workers from the same pool, so the connection is
    # opened on one thread and closed on another. That is safe here: each request
    # gets its own connection and never shares it, so access stays serialised.
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # WAL keeps reads from blocking the daily price-refresh job.
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.commit()
