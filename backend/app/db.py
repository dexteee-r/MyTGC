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
    _add_missing_columns(conn)
    # Only after the columns above are guaranteed to exist: on an existing database
    # they arrive via ALTER TABLE just above, and an index created any earlier --
    # inside the script that just ran, say -- would be created against a column
    # that is not there yet on exactly the database this whole function exists to
    # bring up to date.
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_share_collection"
        " ON users (share_collection_token)"
    )
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_share_wishlist"
        " ON users (share_wishlist_token)"
    )
    conn.commit()


# Columns added after a database already existed. CREATE TABLE IF NOT EXISTS is a
# no-op on a live table, so a new column in schema.sql reaches a fresh install and
# nothing else — the deployed database would keep the old shape and every read of
# the new field would fail. Adding a column is the one migration SQLite does
# cheaply and without a table rewrite, so it is done here rather than in a tool
# somebody has to remember to run.
LATE_COLUMNS = [
    ("wishlist", "price", "REAL"),
    ("users", "default_language", "TEXT NOT NULL DEFAULT 'en'"),
    ("users", "grid_columns", "INTEGER NOT NULL DEFAULT 2"),
    ("cards", "release_date", "TEXT"),
    ("users", "goal_pack_code", "TEXT"),
    ("users", "goal_language", "TEXT"),
    ("collection", "notes", "TEXT"),
    ("users", "share_collection_token", "TEXT"),
    ("users", "share_wishlist_token", "TEXT"),
]


def _add_missing_columns(conn: sqlite3.Connection) -> None:
    for table, column, kind in LATE_COLUMNS:
        existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {kind}")
