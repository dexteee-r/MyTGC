"""GET /collection/value-history: what the collection was worth, on the dates the
importer actually took a reading.

The one rule that matters is date_added <= captured_at -- without it, an account
would show months of value for cards it did not yet own the day the market read
that price.
"""

from conftest import register

from app import db


def seed_prices(rows):
    """rows: (card_id, language, price, captured_at)."""
    conn = db.connect()
    conn.executemany(
        "INSERT INTO price_history (card_id, language, source, price, currency,"
        " captured_at) VALUES (?, ?, 'test', ?, 'EUR', ?)",
        [(c, lang, price, at) for c, lang, price, at in rows],
    )
    conn.commit()
    conn.close()


def own(user_id, card_id, language, quantity, date_added):
    """Insert a collection row with a controlled date_added -- the real endpoint
    always stamps today, which is no good for testing a date boundary."""
    conn = db.connect()
    conn.execute(
        "INSERT INTO collection (user_id, card_id, language, quantity, date_added)"
        " VALUES (?, ?, ?, ?, ?)",
        (user_id, card_id, language, quantity, date_added),
    )
    conn.commit()
    conn.close()


def history(client, account):
    return client.get("/collection/value-history", headers=account["headers"])


def test_an_account_with_nothing_priced_has_an_empty_history(client):
    account = register(client)
    response = history(client, account)
    assert response.status_code == 200
    assert response.json() == []


def test_a_single_holding_reads_price_times_quantity(client):
    account = register(client)
    own(account["user"]["id"], "OP01-001", "en", 3, "2026-08-01")
    seed_prices([("OP01-001", "en", 10.0, "2026-08-05")])

    assert history(client, account).json() == [{"captured_at": "2026-08-05", "total": 30.0}]


def test_two_holdings_on_the_same_date_are_summed(client):
    account = register(client)
    account_id = account["user"]["id"]
    own(account_id, "OP01-001", "en", 2, "2026-08-01")
    own(account_id, "OP01-002", "en", 1, "2026-08-01")
    seed_prices([
        ("OP01-001", "en", 10.0, "2026-08-05"),
        ("OP01-002", "en", 7.0, "2026-08-05"),
    ])

    assert history(client, account).json() == [{"captured_at": "2026-08-05", "total": 27.0}]


def test_a_card_bought_after_the_snapshot_is_not_counted_on_that_date(client):
    """The rule the whole endpoint exists to enforce: a price taken before the card
    was owned must not inflate that day's total."""
    account = register(client)
    own(account["user"]["id"], "OP01-001", "en", 1, "2026-08-10")
    seed_prices([
        ("OP01-001", "en", 10.0, "2026-08-05"),  # before date_added -- excluded
        ("OP01-001", "en", 12.0, "2026-08-10"),  # same day -- included
        ("OP01-001", "en", 15.0, "2026-08-15"),  # after -- included
    ])

    body = history(client, account).json()
    assert body == [
        {"captured_at": "2026-08-10", "total": 12.0},
        {"captured_at": "2026-08-15", "total": 15.0},
    ]


def test_the_history_comes_back_oldest_first(client):
    account = register(client)
    own(account["user"]["id"], "OP01-001", "en", 1, "2026-08-01")
    seed_prices([
        ("OP01-001", "en", 12.0, "2026-08-10"),
        ("OP01-001", "en", 9.0, "2026-08-04"),
    ])

    assert [p["captured_at"] for p in history(client, account).json()] == [
        "2026-08-04", "2026-08-10",
    ]


def test_an_unpriced_holding_is_silently_absent_not_an_error(client):
    """The jp printing has no price feed at all; owning one must not crash the
    endpoint or invent a figure for it."""
    account = register(client)
    own(account["user"]["id"], "OP01-001", "jp", 2, "2026-08-01")
    assert history(client, account).json() == []


def test_value_history_is_private_to_its_account(client):
    alice = register(client, email="alice@example.com")
    bob = register(client, email="bob@example.com", invited_by=alice)
    own(alice["user"]["id"], "OP01-001", "en", 5, "2026-08-01")
    seed_prices([("OP01-001", "en", 10.0, "2026-08-05")])

    assert history(client, bob).json() == []
    assert history(client, alice).json() != []


def test_anonymous_callers_are_refused(client):
    assert client.get("/collection/value-history").status_code == 401
