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


def test_the_price_set_on_an_entry_survives_a_reload(client):
    """Found live: _wish() built its response from a hand-picked tuple of column
    names that never included "price", so a figure saved through PATCH was there
    in the database and gone from every response -- POST's own reply, PATCH's own
    reply, and every later GET -- the moment the page asked for it again."""
    account = register(client)
    entry = client.post("/wishlist", json={"card_id": "OP01-001", "language": "en"},
                        headers=account["headers"]).json()

    patched = client.patch(f"/wishlist/{entry['id']}", json={"price": 12.5},
                           headers=account["headers"])
    assert patched.json()["price"] == 12.5

    reloaded = client.get("/wishlist", headers=account["headers"]).json()
    assert reloaded[0]["price"] == 12.5


def test_wanting_a_card_that_does_not_exist_is_refused(client):
    account = register(client)
    assert client.post("/wishlist", json={"card_id": "ZZ99-999", "language": "en"},
                       headers=account["headers"]).status_code == 404


# --- a whole set at once ----------------------------------------------------------

def _bulk(client, account, pack_code="OP-01", language="en"):
    return client.post("/wishlist/bulk",
                       json={"pack_code": pack_code, "language": language},
                       headers=account["headers"])


def test_everything_missing_from_a_set_can_be_wanted_at_once(client):
    account = register(client)
    result = _bulk(client, account).json()

    assert result == {"missing": 3, "added": 3, "already_listed": 0}
    assert len(client.get("/wishlist", headers=account["headers"]).json()) == 3


def test_the_bulk_add_leaves_out_what_is_already_held(client):
    account = register(client)
    client.post("/collection", json={"card_id": "OP01-001", "language": "en"},
                headers=account["headers"])

    result = _bulk(client, account).json()
    assert result["missing"] == 2
    assert result["added"] == 2
    wanted = {e["card_id"] for e in client.get("/wishlist", headers=account["headers"]).json()}
    assert "OP01-001" not in wanted


def test_the_bulk_add_never_touches_an_entry_already_there(client):
    """The reason this endpoint exists rather than a loop over POST /wishlist.

    That endpoint treats a repeat as an edit, so looping over a set would reset the
    priority, the price and the notes on every card already wanted — silently, and
    with no way back. Nothing here may overwrite.
    """
    account = register(client)
    client.post(
        "/wishlist",
        json={"card_id": "OP01-002", "language": "en", "priority": 1,
              "alert_threshold": 12.5, "price": 30.0, "notes": "vue en boutique"},
        headers=account["headers"],
    )

    result = _bulk(client, account).json()
    assert result == {"missing": 3, "added": 2, "already_listed": 1}

    kept = next(e for e in client.get("/wishlist", headers=account["headers"]).json()
                if e["card_id"] == "OP01-002")
    assert kept["priority"] == 1
    assert kept["alert_threshold"] == 12.5
    assert kept["notes"] == "vue en boutique"

    # The ones it did add take the ordinary default rather than inheriting anything.
    fresh = next(e for e in client.get("/wishlist", headers=account["headers"]).json()
                 if e["card_id"] == "OP01-001")
    assert fresh["priority"] == 2
    assert fresh["notes"] is None


def test_running_it_twice_adds_nothing_the_second_time(client):
    account = register(client)
    _bulk(client, account)
    again = _bulk(client, account).json()

    assert again == {"missing": 3, "added": 0, "already_listed": 3}
    assert len(client.get("/wishlist", headers=account["headers"]).json()) == 3


def test_the_bulk_add_stays_in_the_edition_it_was_asked_for(client):
    """The catalogue holds each card twice. Wanting the whole English set must not
    quietly add its Japanese twin, which is a different card to own."""
    account = register(client)
    _bulk(client, account, language="en")

    entries = client.get("/wishlist", headers=account["headers"]).json()
    assert {e["language"] for e in entries} == {"en"}
    assert _bulk(client, account, language="jp").json()["added"] == 1


def test_an_unknown_set_is_refused(client):
    account = register(client)
    assert _bulk(client, account, pack_code="ZZ-99").status_code == 404


def test_one_account_cannot_fill_another_ones_list(client):
    alice = register(client, email="alice@example.com")
    bob = register(client, email="bob@example.com", invited_by=alice)
    _bulk(client, alice)

    assert client.get("/wishlist", headers=bob["headers"]).json() == []


def test_the_bulk_add_refuses_anonymous_callers(client):
    assert client.post("/wishlist/bulk",
                       json={"pack_code": "OP-01", "language": "en"}).status_code == 401


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
