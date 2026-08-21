"""Personal, user-named groups within a collection (BACKLOG.md: "même dessinateur",
"même style d'illustration", or any other reason a collector decides two cards
belong together). Manual on purpose -- nothing about the catalogue supports
grouping automatically."""

from conftest import register


def add_card(client, account, card_id="OP01-001", language="en"):
    return client.post(
        "/collection", json={"card_id": card_id, "language": language},
        headers=account["headers"],
    ).json()


def test_a_new_group_starts_empty(client):
    account = register(client)
    group = client.post(
        "/collection/groups", json={"name": "Illustrateur A"}, headers=account["headers"]
    ).json()
    assert group["name"] == "Illustrateur A"
    assert group["card_count"] == 0


def test_groups_are_listed_newest_first(client):
    account = register(client)
    for name in ("Premier", "Second"):
        client.post("/collection/groups", json={"name": name}, headers=account["headers"])

    names = [g["name"] for g in client.get("/collection/groups", headers=account["headers"]).json()]
    assert names == ["Second", "Premier"]


def test_a_group_can_be_renamed(client):
    account = register(client)
    group = client.post(
        "/collection/groups", json={"name": "Brouillon"}, headers=account["headers"]
    ).json()

    renamed = client.patch(
        f"/collection/groups/{group['id']}", json={"name": "Alternate arts"},
        headers=account["headers"],
    )
    assert renamed.json()["name"] == "Alternate arts"


def test_deleting_a_group_does_not_touch_the_cards_inside_it(client):
    """Deleting a folder never deletes what was filed in it."""
    account = register(client)
    entry = add_card(client, account)
    group = client.post(
        "/collection/groups", json={"name": "À trier"}, headers=account["headers"]
    ).json()
    client.post(
        f"/collection/groups/{group['id']}/members",
        json={"collection_ids": [entry["id"]]}, headers=account["headers"],
    )

    client.delete(f"/collection/groups/{group['id']}", headers=account["headers"])

    assert client.get("/collection/groups", headers=account["headers"]).json() == []
    assert len(client.get("/collection", headers=account["headers"]).json()) == 1


def test_adding_and_listing_the_cards_in_a_group(client):
    account = register(client)
    entry = add_card(client, account)
    group = client.post(
        "/collection/groups", json={"name": "Straw Hats"}, headers=account["headers"]
    ).json()

    client.post(
        f"/collection/groups/{group['id']}/members",
        json={"collection_ids": [entry["id"]]}, headers=account["headers"],
    )

    cards = client.get(f"/collection/groups/{group['id']}/cards", headers=account["headers"]).json()
    assert [c["id"] for c in cards] == [entry["id"]]

    refreshed = client.get("/collection/groups", headers=account["headers"]).json()
    assert refreshed[0]["card_count"] == 1


def test_several_cards_are_added_in_one_call(client):
    """Multi-select on the Collection grid adds many cards at once -- one round
    trip, not one per card."""
    account = register(client)
    first = add_card(client, account, "OP01-001")
    second = add_card(client, account, "OP01-002")
    group = client.post(
        "/collection/groups", json={"name": "Duo"}, headers=account["headers"]
    ).json()

    client.post(
        f"/collection/groups/{group['id']}/members",
        json={"collection_ids": [first["id"], second["id"]]}, headers=account["headers"],
    )

    cards = client.get(f"/collection/groups/{group['id']}/cards", headers=account["headers"]).json()
    assert {c["id"] for c in cards} == {first["id"], second["id"]}


def test_adding_the_same_card_twice_does_not_duplicate_the_membership(client):
    account = register(client)
    entry = add_card(client, account)
    group = client.post(
        "/collection/groups", json={"name": "Répétition"}, headers=account["headers"]
    ).json()

    for _ in range(2):
        client.post(
            f"/collection/groups/{group['id']}/members",
            json={"collection_ids": [entry["id"]]}, headers=account["headers"],
        )

    refreshed = client.get("/collection/groups", headers=account["headers"]).json()
    assert refreshed[0]["card_count"] == 1


def test_removing_a_card_from_a_group_leaves_the_holding_untouched(client):
    account = register(client)
    entry = add_card(client, account)
    group = client.post(
        "/collection/groups", json={"name": "Temporaire"}, headers=account["headers"]
    ).json()
    client.post(
        f"/collection/groups/{group['id']}/members",
        json={"collection_ids": [entry["id"]]}, headers=account["headers"],
    )

    client.delete(
        f"/collection/groups/{group['id']}/members/{entry['id']}", headers=account["headers"]
    )

    assert client.get(f"/collection/groups/{group['id']}/cards", headers=account["headers"]).json() == []
    assert len(client.get("/collection", headers=account["headers"]).json()) == 1


def test_removing_a_card_from_the_collection_removes_it_from_every_group(client):
    """A group organises what is actually owned -- it cannot outlive the holding
    it points at."""
    account = register(client)
    entry = add_card(client, account)
    group = client.post(
        "/collection/groups", json={"name": "Va disparaître"}, headers=account["headers"]
    ).json()
    client.post(
        f"/collection/groups/{group['id']}/members",
        json={"collection_ids": [entry["id"]]}, headers=account["headers"],
    )

    client.delete(f"/collection/{entry['id']}", headers=account["headers"])

    cards = client.get(f"/collection/groups/{group['id']}/cards", headers=account["headers"]).json()
    assert cards == []
    refreshed = client.get("/collection/groups", headers=account["headers"]).json()
    assert refreshed[0]["card_count"] == 0


def test_adding_a_holding_that_belongs_to_someone_else_is_silently_ignored(client):
    """The SELECT that backs the insert is scoped to the caller's own holdings --
    a stray id for someone else's card adds nothing rather than leaking it in."""
    alice = register(client, email="alice@example.com")
    bob = register(client, email="bob@example.com", invited_by=alice)
    bob_entry = add_card(client, bob)
    alice_group = client.post(
        "/collection/groups", json={"name": "Alice seule"}, headers=alice["headers"]
    ).json()

    client.post(
        f"/collection/groups/{alice_group['id']}/members",
        json={"collection_ids": [bob_entry["id"]]}, headers=alice["headers"],
    )

    assert client.get(
        f"/collection/groups/{alice_group['id']}/cards", headers=alice["headers"]
    ).json() == []


def test_a_group_is_invisible_and_untouchable_from_another_account(client):
    alice = register(client, email="alice2@example.com")
    bob = register(client, email="bob2@example.com", invited_by=alice)
    group = client.post(
        "/collection/groups", json={"name": "Privé"}, headers=alice["headers"]
    ).json()

    assert client.get("/collection/groups", headers=bob["headers"]).json() == []
    assert client.get(
        f"/collection/groups/{group['id']}/cards", headers=bob["headers"]
    ).status_code == 404
    assert client.patch(
        f"/collection/groups/{group['id']}", json={"name": "Volé"}, headers=bob["headers"]
    ).status_code == 404
    assert client.delete(
        f"/collection/groups/{group['id']}", headers=bob["headers"]
    ).status_code == 404
    assert client.post(
        f"/collection/groups/{group['id']}/members", json={"collection_ids": [1]},
        headers=bob["headers"],
    ).status_code == 404


def test_renaming_or_deleting_a_group_that_does_not_exist_is_a_404(client):
    account = register(client)
    assert client.patch(
        "/collection/groups/999999", json={"name": "x"}, headers=account["headers"]
    ).status_code == 404
    assert client.delete(
        "/collection/groups/999999", headers=account["headers"]
    ).status_code == 404


def test_the_groups_route_is_not_shadowed_by_the_entry_id_route(client):
    """/collection/{entry_id} expects entry_id: int -- if /collection/groups were
    registered after it, "groups" would fail that coercion with a 422 instead of
    ever reaching here. Same routing trap /collection/share was already caught by."""
    account = register(client)
    response = client.get("/collection/groups", headers=account["headers"])
    assert response.status_code == 200
