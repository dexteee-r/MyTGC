"""Create (or reset) the local development account.

    MYTCG_ALLOW_DEV_ACCOUNT=1 python backend/scripts/dev_account.py

Signs in with `admin@mytcg.dev` / `admin`.

The row is written straight to the database rather than posted to /auth/register, so
none of the API's rules have to bend for a convenience account: registration stays
invite-only, and a password under ten characters stays refused for everybody else.
The hash comes from the app's own Argon2 hasher, so the stored shape is identical to
a real signup and nothing about the login path is special-cased.

Two things this cannot do, both because Pydantic validates the login body before any
of our code runs. The identifier has to look like an email — a bare `admin` is
rejected with a 422 at the request boundary — and the domain cannot be a reserved
one, which rules out `admin@admin.local`. Hence `admin@mytcg.dev`.

The environment guard is not ceremony. This script would happily create an
admin/admin account on the deployed instance, which is reachable from the internet.
"""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.auth import hash_password  # noqa: E402
from app.db import connect, init_schema  # noqa: E402

EMAIL = "admin@mytcg.dev"
PASSWORD = "admin"

if os.environ.get("MYTCG_ALLOW_DEV_ACCOUNT") != "1":
    raise SystemExit(
        "Refusing to run without MYTCG_ALLOW_DEV_ACCOUNT=1.\n"
        "This creates an account whose password is 'admin'. It belongs on a laptop, "
        "never on the deployed instance."
    )


def main() -> None:
    conn = connect()
    init_schema(conn)
    existing = conn.execute(
        "SELECT id FROM users WHERE email_lower = ?", (EMAIL.lower(),)
    ).fetchone()

    if existing:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(PASSWORD), existing["id"]),
        )
        print(f"reset   {EMAIL} (id {existing['id']})")
    else:
        cursor = conn.execute(
            "INSERT INTO users (email, email_lower, display_name, password_hash,"
            " created_at) VALUES (?, ?, ?, ?, ?)",
            (
                EMAIL,
                EMAIL.lower(),
                "admin",
                hash_password(PASSWORD),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        print(f"created {EMAIL} (id {cursor.lastrowid})")
    conn.commit()


if __name__ == "__main__":
    main()
