"""One account must never reach another's collection.

This is the property the whole multi-user change exists to provide, so it is
tested from the outside on every endpoint that touches user-owned data — including
the ones where the leak would be silent, like a pack progress count.
"""

from conftest import register
import pytest


@pytest.fixture
def two_accounts(client):
    alice = register(client, email="alice@example.com")
    bob = register(client, email="bob@example.com", invited_by=alice)
    entry = client.post(
        "/collection",
        json={"card_id": "OP01-001", "language": "en", "quantity": 3},
        headers=alice["headers"],
    ).json()
    return alice, bob, entry


def test_a_collection_is_private(client, two_accounts):
    _, bob, _ = two_accounts
    assert client.get("/collection", headers=bob["headers"]).json() == []


def test_statistics_do_not_leak_across_accounts(client, two_accounts):
    alice, bob, _ = two_accounts
    assert client.get("/collection/stats", headers=alice["headers"]).json()["total_quantity"] == 3
    assert client.get("/collection/stats", headers=bob["headers"]).json()["total_quantity"] == 0


def test_pack_progress_is_per_account(client, two_accounts):
    """A count is still a disclosure: it says what someone else owns."""
    alice, bob, _ = two_accounts
    owned = lambda who: sum(  # noqa: E731
        p["owned_count"] for p in client.get("/packs", headers=who["headers"]).json()
    )
    assert owned(alice) == 1
    assert owned(bob) == 0


def test_the_owned_filter_is_per_account(client, two_accounts):
    alice, bob, _ = two_accounts
    for who, expected in ((alice, 1), (bob, 0)):
        page = client.get("/cards?owned=true", headers=who["headers"]).json()
        assert page["total"] == expected


def test_another_account_cannot_edit_a_holding(client, two_accounts):
    """Scoped by user_id and not by row id alone, so guessing a number gets nowhere."""
    alice, bob, entry = two_accounts
    assert client.patch(
        f"/collection/{entry['id']}", json={"quantity": 99}, headers=bob["headers"]
    ).status_code == 404

    still = client.get("/collection", headers=alice["headers"]).json()
    assert still[0]["quantity"] == 3


def test_another_account_cannot_delete_a_holding(client, two_accounts):
    alice, bob, entry = two_accounts
    assert client.delete(
        f"/collection/{entry['id']}", headers=bob["headers"]
    ).status_code == 404
    assert len(client.get("/collection", headers=alice["headers"]).json()) == 1
