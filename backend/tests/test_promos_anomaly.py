"""The Promos anomaly (BACKLOG.md): cards with no printed set code, so
pack_code is null and only pack_id -- punk-records' own numeric key -- says
which set a card belongs to. The Extensions screen has always linked to a
Promos set by pack_id (Packs.tsx: `pack.pack_code ?? pack.pack_id`); every
endpoint that means "which set" by pack_code now has to resolve that same
value against pack_id whenever pack_code is absent (SET_KEY in main.py),
or the link it was handed leads nowhere.
"""

from conftest import register

from app import db

PROMO_PACK_ID = "569901"


def seed_promo():
    """A card with no printed code, on top of the four the fixture lays down."""
    conn = db.connect()
    conn.execute(
        "INSERT INTO cards (id, language, name, pack_id, pack_code, pack_name,"
        " rarity, category, colors) VALUES (?, 'en', 'Promo Luffy', ?, NULL,"
        " 'Promotion card', 'Rare', 'Character', '[\"Red\"]')",
        ("PR-001", PROMO_PACK_ID),
    )
    conn.commit()
    conn.close()


def test_cards_are_found_by_pack_id_when_pack_code_is_absent(client):
    account = register(client)
    seed_promo()
    found = client.get(
        "/cards", params={"pack_code": PROMO_PACK_ID, "language": "en"},
        headers=account["headers"],
    )
    assert [c["id"] for c in found.json()["items"]] == ["PR-001"]


def test_a_real_pack_code_still_works_unaffected(client):
    """The fallback must never widen a real code into matching by id too --
    OP01-001's own pack_id (569101) is not OP01-001's pack_code (OP-01), and a
    lookup by the real code should not accidentally start matching on id."""
    account = register(client)
    found = client.get(
        "/cards", params={"pack_code": "OP-01", "language": "en"},
        headers=account["headers"],
    )
    ids = {c["id"] for c in found.json()["items"]}
    assert ids == {"OP01-001", "OP01-002", "OP01-002_p1"}


def test_everything_missing_from_a_promos_set_can_be_wanted(client):
    account = register(client)
    seed_promo()
    response = client.post(
        "/wishlist/bulk", json={"pack_code": PROMO_PACK_ID, "language": "en"},
        headers=account["headers"],
    )
    assert response.status_code == 201
    assert response.json()["added"] == 1
    assert [e["card_id"] for e in
           client.get("/wishlist", headers=account["headers"]).json()] == ["PR-001"]


def test_a_promos_set_can_be_chosen_as_the_goal(client):
    account = register(client)
    seed_promo()
    response = client.patch(
        "/auth/me", json={"goal_pack_code": PROMO_PACK_ID, "goal_language": "en"},
        headers=account["headers"],
    )
    assert response.status_code == 200
    assert response.json()["goal_pack_code"] == PROMO_PACK_ID
