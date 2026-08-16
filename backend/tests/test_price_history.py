"""GET /cards/{id}/prices: the series a chart on the card sheet reads from.

market_price on the catalogue endpoints is only ever the latest snapshot -- this is
the first place the accumulated history actually leaves the database.
"""

from conftest import register

from app import db


def seed_prices(rows):
    """rows: (card_id, language, price, captured_at)."""
    conn = db.connect()
    conn.executemany(
        "INSERT INTO price_history (card_id, language, source, price, currency,"
        " captured_at) VALUES (?, ?, 'test', ?, 'EUR', ?)",
        [(card_id, language, price, captured_at) for card_id, language, price, captured_at in rows],
    )
    conn.commit()
    conn.close()


def history(client, account, card_id, **params):
    return client.get(f"/cards/{card_id}/prices", params=params, headers=account["headers"])


def test_a_card_with_no_snapshots_has_an_empty_history(client):
    account = register(client)
    response = history(client, account, "OP01-001")
    assert response.status_code == 200
    assert response.json() == []


def test_the_history_comes_back_oldest_first(client):
    """A chart reads left to right; the importer writes rows in whatever order the
    run happened to reach them, so the ordering is the endpoint's job, not a hope
    about insertion order."""
    account = register(client)
    seed_prices([
        ("OP01-001", "en", 12.0, "2026-08-10"),
        ("OP01-001", "en", 9.5, "2026-08-04"),
        ("OP01-001", "en", 11.0, "2026-08-07"),
    ])
    body = history(client, account, "OP01-001").json()
    assert [p["captured_at"] for p in body] == ["2026-08-04", "2026-08-07", "2026-08-10"]
    assert [p["price"] for p in body] == [9.5, 11.0, 12.0]


def test_the_two_editions_of_a_card_keep_separate_histories(client):
    """OP01-001 exists in both en and jp in the fixture; a card that has never been
    priced in one language must not surface the other's numbers."""
    account = register(client)
    seed_prices([("OP01-001", "en", 12.0, "2026-08-10")])

    assert len(history(client, account, "OP01-001", language="en").json()) == 1
    assert history(client, account, "OP01-001", language="jp").json() == []


def test_an_unknown_card_is_refused(client):
    account = register(client)
    assert history(client, account, "ZZ99-999").status_code == 404


def test_a_card_that_only_exists_in_one_edition_is_refused_in_the_other(client):
    """OP01-002 is only seeded for en. Asking for its jp history should read as not
    found, the same as a made-up id -- not as an empty, valid history."""
    account = register(client)
    assert history(client, account, "OP01-002", language="jp").status_code == 404


def test_anonymous_callers_are_refused(client):
    assert client.get("/cards/OP01-001/prices").status_code == 401
