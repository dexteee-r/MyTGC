"""Move an existing single-user database onto accounts.

`collection` and `wishlist` gain a `user_id`. SQLite cannot add a NOT NULL foreign
key column to a populated table, so both are rebuilt and their rows handed to the
account created here — the person whose collection it already was.

Idempotent: running it on an already-migrated database reports and exits.

Usage:
    py backend/scripts/migrate_multiuser.py --email you@example.com --password '...'
    py backend/scripts/migrate_multiuser.py --email you@example.com   (prompts)
"""

import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import auth, db

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

MIN_PASSWORD = 10


def has_column(conn, table: str, column: str) -> bool:
    return any(row["name"] == column
               for row in conn.execute(f"PRAGMA table_info({table})"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate to multi-user.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password")
    parser.add_argument("--name", help="display name, defaults to the local part")
    args = parser.parse_args()

    password = args.password or getpass.getpass("Password: ")
    if len(password) < MIN_PASSWORD:
        print(f"Password must be at least {MIN_PASSWORD} characters.", file=sys.stderr)
        return 1

    conn = db.connect()

    if has_column(conn, "collection", "user_id"):
        db.init_schema(conn)
        owners = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        print(f"Already migrated. {owners} account(s) exist; nothing to do.")
        return 0

    tables = {
        "collection": "card_id, language, quantity, condition, date_added, acquisition_price",
        "wishlist": "card_id, language, priority, alert_threshold, notes",
    }

    # Rename before touching the schema. init_schema declares indexes on user_id, so
    # running it against the old tables fails before it can create anything.
    kept = {}
    for table in tables:
        if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                        (table,)).fetchone():
            kept[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            conn.execute(f"ALTER TABLE {table} RENAME TO {table}_old")

    db.init_schema(conn)          # users, refresh_tokens, and the scoped tables

    email = args.email.strip()
    cursor = conn.execute(
        "INSERT INTO users (email, email_lower, display_name, password_hash, created_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (email, email.lower(), args.name or email.split("@")[0],
         auth.hash_password(password), auth.now().isoformat(timespec="seconds")),
    )
    user_id = cursor.lastrowid

    for table, moved in kept.items():
        conn.execute(
            f"INSERT INTO {table} (user_id, {tables[table]})"
            f" SELECT ?, {tables[table]} FROM {table}_old", (user_id,),
        )
        conn.execute(f"DROP TABLE {table}_old")
        print(f"  {table}: {moved} row(s) assigned to {email}")

    conn.commit()
    print(f"\nAccount created: {email} (id {user_id})")
    print("Set MYTGC_SECRET_KEY in the environment before starting the API, "
          "otherwise every session dies on restart.")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
