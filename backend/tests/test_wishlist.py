"""Wishlist: the cards someone is hunting, as opposed to the ones they hold."""

from conftest import register


def test_a_wishlist_starts_empty(client):
    account = register(client)
    assert client.get("/wishlist", headers=account["headers"]).json() == []


def test_a_card_can_be_wanted(client):
    account = register(client)
    created = client.post(
        "/wishlist",
        json={"card_id": "OP01-002", "language": "en", "priority": 1,
              "alert_threshold": 12.5, "notes": "alt art"},
        headers=account["headers"],
    )
    assert created.status_code == 201
    body = created.json()
    assert body["priority"] == 1
    assert body["alert_threshold"] == 12.5
    # The card record rides along so a list does not need a request per row.
    assert body["card"]["name"] == "Roronoa Zoro"


def test_wanting_the_same_card_twice_edits_it(client):
    """Wanting a card is not a quantity. A second add adjusts the entry rather than
    stacking a duplicate, the same way the collection increments."""
    account = register(client)
    for priority in (3, 1):
        client.post(
            "/wishlist",
            json={"card_id": "OP01-002", "language": "en", "priority": priority},
            headers=account["headers"],
        )

    entries = client.get("/wishlist", headers=account["headers"]).json()
    assert len(entries) == 1
    assert entries[0]["priority"] == 1


def test_the_two_editions_are_wanted_separately(client):
    account = register(client)
    for language in ("en", "jp"):
        client.post("/wishlist", json={"card_id": "OP01-001", "language": language},
                    headers=account["headers"])
    assert len(client.get("/wishlist", headers=account["headers"]).json()) == 2


def test_the_list_comes_back_most_wanted_first(client):
    account = register(client)
    client.post("/wishlist", json={"card_id": "OP01-001", "language": "en", "priority": 3},
                headers=account["headers"])
    client.post("/wishlist", json={"card_id": "OP01-002", "language": "en", "priority": 1},
                headers=account["headers"])

    entries = client.get("/wishlist", headers=account["headers"]).json()
    assert [e["card_id"] for e in entries] == ["OP01-002", "OP01-001"]


def test_priority_stays_within_its_scale(client):
    account = register(client)
    for priority in (0, 4):
        response = client.post(
            "/wishlist",
            json={"card_id": "OP01-001", "language": "en", "priority": priority},
            headers=account["headers"],
        )
        assert response.status_code == 422


def test_an_entry_can_be_edited_and_removed(client):
    account = register(client)
    entry = client.post("/wishlist", json={"card_id": "OP01-001", "language": "en"},
                        headers=account["headers"]).json()

    patched = client.patch(f"/wishlist/{entry['id']}", json={"notes": "vu chez un ami"},
                           headers=account["headers"])
    assert patched.json()["notes"] == "vu chez un ami"

    assert client.delete(f"/wishlist/{entry['id']}",
                         headers=account["headers"]).status_code == 204
    assert client.get("/wishlist", headers=account["headers"]).json() == []


def test_wanting_a_card_that_does_not_exist_is_refused(client):
    account = register(client)
    assert client.post("/wishlist", json={"card_id": "ZZ99-999", "language": "en"},
                       headers=account["headers"]).status_code == 404


# --- isolation ------------------------------------------------------------------

def test_a_wishlist_is_private(client):
    alice = register(client, email="alice@example.com")
    bob = register(client, email="bob@example.com", invited_by=alice)
    entry = client.post("/wishlist", json={"card_id": "OP01-001", "language": "en"},
                        headers=alice["headers"]).json()

    assert client.get("/wishlist", headers=bob["headers"]).json() == []
    assert client.patch(f"/wishlist/{entry['id']}", json={"priority": 1},
                        headers=bob["headers"]).status_code == 404
    assert client.delete(f"/wishlist/{entry['id']}",
                         headers=bob["headers"]).status_code == 404


def test_anonymous_callers_are_refused(client):
    assert client.get("/wishlist").status_code == 401
    assert client.post("/wishlist", json={"card_id": "OP01-001", "language": "en"}).status_code == 401
