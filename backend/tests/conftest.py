"""Test fixtures.

Every test runs against a throwaway database in a temp directory. The environment
is set before the app is imported, because config.py resolves the paths at import
time — the real collection must never be reachable from a test run.
"""

import os
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

_TEMP = tempfile.mkdtemp(prefix="mytcg-tests-")
os.environ["MYTCG_DATA_DIR"] = _TEMP
os.environ["MYTCG_DB_PATH"] = str(Path(_TEMP) / "test.db")
os.environ.setdefault("MYTCG_SECRET_KEY", "test-key-fixed-so-tokens-are-stable")

from fastapi.testclient import TestClient  # noqa: E402

from app import db, throttle  # noqa: E402
from app.main import app  # noqa: E402

# A handful of cards is enough: the tests are about accounts and scoping, not the
# catalogue. Two languages and a sibling printing so grouping can be exercised.
SEED_CARDS = [
    ("OP01-001", "en", "Monkey.D.Luffy", "569101", "OP-01", "ROMANCE DAWN", "Leader",
     "Leader", '["Red"]'),
    ("OP01-001", "jp", "モンキー・D・ルフィ", "550101", "OP-01", "ロマンスドーン", "Leader",
     "Leader", '["Red"]'),
    ("OP01-002", "en", "Roronoa Zoro", "569101", "OP-01", "ROMANCE DAWN", "Rare",
     "Character", '["Red","Green"]'),
    ("OP01-002_p1", "en", "Roronoa Zoro", "569101", "OP-01", "ROMANCE DAWN", "Rare",
     "Character", '["Red","Green"]'),
]


@pytest.fixture(autouse=True)
def fresh_database():
    """A clean database per test, so nothing leaks between them.

    Rate-limit counters are cleared too: they live in the process, not the
    database, so without this the first few tests would consume the registration
    allowance and every later test would get a 429 instead of its own result.
    """
    for window in (throttle.LOGIN, throttle.REGISTER, throttle.SCAN):
        window._hits.clear()

    connection = db.connect()
    db.init_schema(connection)
    for table in ("refresh_tokens", "invites", "collection", "wishlist", "users",
                  "cards", "price_history"):
        connection.execute(f"DELETE FROM {table}")
    connection.executemany(
        "INSERT INTO cards (id, language, name, pack_id, pack_code, pack_name,"
        " rarity, category, colors) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        SEED_CARDS,
    )
    connection.commit()
    connection.close()
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def register(client, email="a@example.com", password="a-long-enough-password",
             invited_by=None):
    """Register and return the account's bearer header.

    Registration is invite-only by default, so any account after the first needs a
    code. Pass `invited_by` — an already-registered account — and one is minted
    through the real endpoint, so the suite goes through the policy rather than
    around it.
    """
    payload = {"email": email, "password": password}
    if invited_by is not None:
        minted = client.post("/auth/invites", json={}, headers=invited_by["headers"])
        assert minted.status_code == 201, minted.text
        payload["invite_code"] = minted.json()["code"]

    response = client.post("/auth/register", json=payload)
    assert response.status_code == 201, response.text
    session = response.json()
    return {
        "headers": {"Authorization": f"Bearer {session['access_token']}"},
        "refresh": session["refresh_token"],
        "user": session["user"],
        "password": password,
        "email": email,
    }
