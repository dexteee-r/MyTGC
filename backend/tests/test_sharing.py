"""Public, unauthenticated read links for a collection or a want list.

The one property that matters more than any other: what crosses into the public
view and what does not. acquisition_price, collection notes and the alert
threshold are never reachable through this door, no matter what the private
endpoints return -- checked by asserting the key is absent from the JSON, not
just null, since a null still proves the model carries the field.
"""

from conftest import register


def test_collection_sharing_starts_disabled(client):
    account = register(client)
    status = client.get("/collection/share", headers=account["headers"]).json()
    assert status == {"enabled": False, "token": None}


def test_enabling_collection_sharing_mints_a_token(client):
    account = register(client)
    status = client.post("/collection/share", headers=account["headers"]).json()
    assert status["enabled"] is True
    assert status["token"]

    # GET afterwards reflects the same state, without minting a second time.
    again = client.get("/collection/share", headers=account["headers"]).json()
    assert again == status


def test_enabling_it_twice_keeps_the_same_token(client):
    """The whole point of a link is being handed out more than once -- a second POST
    must never quietly invalidate a link already sent to someone."""
    account = register(client)
    first = client.post("/collection/share", headers=account["headers"]).json()
    second = client.post("/collection/share", headers=account["headers"]).json()
    assert first["token"] == second["token"]


def test_disabling_sharing_clears_the_token(client):
    account = register(client)
    client.post("/collection/share", headers=account["headers"])
    # Asserted here and not only through the GET that follows: a route this DELETE
    # cannot reach would fail loudly right at this line instead of being read, once,
    # as "well, disabling did *something*" from a GET three lines down.
    assert client.delete("/collection/share", headers=account["headers"]).status_code == 204

    status = client.get("/collection/share", headers=account["headers"]).json()
    assert status == {"enabled": False, "token": None}


def test_the_public_view_needs_no_authentication(client):
    account = register(client)
    token = client.post("/collection/share", headers=account["headers"]).json()["token"]

    response = client.get(f"/shared/collection/{token}")  # no headers at all
    assert response.status_code == 200


def test_an_unknown_token_is_refused(client):
    assert client.get("/shared/collection/not-a-real-token").status_code == 404


def test_a_revoked_link_stops_working(client):
    account = register(client)
    token = client.post("/collection/share", headers=account["headers"]).json()["token"]
    assert client.delete("/collection/share", headers=account["headers"]).status_code == 204

    assert client.get(f"/shared/collection/{token}").status_code == 404


def test_the_shared_collection_lists_what_is_owned(client):
    account = register(client)
    client.post("/collection", json={"card_id": "OP01-001", "language": "en", "quantity": 3},
                headers=account["headers"])
    token = client.post("/collection/share", headers=account["headers"]).json()["token"]

    body = client.get(f"/shared/collection/{token}").json()
    assert len(body["entries"]) == 1
    entry = body["entries"][0]
    assert entry["card_id"] == "OP01-001"
    assert entry["quantity"] == 3
    assert entry["card"]["name"] == "Monkey.D.Luffy"


def test_the_shared_collection_never_carries_acquisition_price_or_notes(client):
    account = register(client)
    entry = client.post(
        "/collection",
        json={"card_id": "OP01-001", "language": "en", "acquisition_price": 42.0},
        headers=account["headers"],
    ).json()
    client.patch(f"/collection/{entry['id']}", json={"notes": "achetée à Paris"},
                headers=account["headers"])
    # Confirm the private endpoint really does carry both, so the next assertion is
    # about the public view narrowing them out and not about them never existing.
    private = client.get("/collection", headers=account["headers"]).json()[0]
    assert private["acquisition_price"] == 42.0
    assert private["notes"] == "achetée à Paris"

    token = client.post("/collection/share", headers=account["headers"]).json()["token"]
    shared = client.get(f"/shared/collection/{token}").json()["entries"][0]
    assert "acquisition_price" not in shared
    assert "notes" not in shared


def test_the_shared_collection_shows_a_display_name_not_an_email(client):
    account = register(client)
    client.patch("/auth/me", json={"display_name": "Luffy"}, headers=account["headers"])
    token = client.post("/collection/share", headers=account["headers"]).json()["token"]

    body = client.get(f"/shared/collection/{token}").json()
    assert body["owner_name"] == "Luffy"
    assert "a@example.com" not in str(body)


def test_two_accounts_never_share_a_token(client):
    alice = register(client, email="alice@example.com")
    bob = register(client, email="bob@example.com", invited_by=alice)
    a = client.post("/collection/share", headers=alice["headers"]).json()["token"]
    b = client.post("/collection/share", headers=bob["headers"]).json()["token"]
    assert a != b


# --- the want list ------------------------------------------------------------

def test_wishlist_sharing_starts_disabled(client):
    account = register(client)
    assert client.get("/wishlist/share", headers=account["headers"]).json() == {
        "enabled": False, "token": None,
    }


def test_the_shared_wishlist_keeps_the_price_but_drops_notes_and_the_threshold(client):
    """The price is what the card went for somewhere public -- exactly the context a
    viewer needs to make an offer. The threshold and the notes are the owner's own,
    not the viewer's business."""
    account = register(client)
    client.post(
        "/wishlist",
        json={"card_id": "OP01-001", "language": "en", "price": 12.5,
              "alert_threshold": 8.0, "notes": "vue chez un ami"},
        headers=account["headers"],
    )
    token = client.post("/wishlist/share", headers=account["headers"]).json()["token"]

    entry = client.get(f"/shared/wishlist/{token}").json()["entries"][0]
    assert entry["price"] == 12.5
    assert "notes" not in entry
    assert "alert_threshold" not in entry


def test_a_revoked_wishlist_link_stops_working(client):
    account = register(client)
    token = client.post("/wishlist/share", headers=account["headers"]).json()["token"]
    assert client.delete("/wishlist/share", headers=account["headers"]).status_code == 204
    assert client.get(f"/shared/wishlist/{token}").status_code == 404


def test_collection_and_wishlist_sharing_are_independent(client):
    """Turning one on must not turn the other on, and they must not answer to each
    other's token."""
    account = register(client)
    collection_token = client.post("/collection/share", headers=account["headers"]).json()["token"]

    assert client.get("/wishlist/share", headers=account["headers"]).json()["enabled"] is False
    assert client.get(f"/shared/wishlist/{collection_token}").status_code == 404
