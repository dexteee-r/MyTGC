"""Recent searches. Kept on the account because the contract rules out localStorage,
which is the whole reason this endpoint exists — the first version lived in React state
and emptied itself on every reload, so "history" was a list that never survived.
"""

from conftest import register


def post(client, account, query):
    return client.post("/search-history", json={"query": query},
                       headers=account["headers"])


def listed(client, account):
    return client.get("/search-history", headers=account["headers"]).json()


def test_a_search_is_remembered(client):
    account = register(client)
    post(client, account, "zoro")
    assert listed(client, account) == ["zoro"]


def test_the_most_recent_search_comes_first(client):
    account = register(client)
    for query in ("zoro", "luffy", "ace"):
        post(client, account, query)
    assert listed(client, account) == ["ace", "luffy", "zoro"]


def test_searching_the_same_thing_again_moves_it_up_without_duplicating_it(client):
    account = register(client)
    for query in ("zoro", "luffy", "zoro"):
        post(client, account, query)
    assert listed(client, account) == ["zoro", "luffy"]


def test_only_the_last_eight_are_kept(client):
    """Otherwise the list grows without bound behind a panel that shows a handful."""
    account = register(client)
    for n in range(12):
        post(client, account, f"carte-{n}")

    remembered = listed(client, account)
    assert len(remembered) == 8
    assert remembered[0] == "carte-11"
    assert "carte-0" not in remembered


def test_an_empty_search_is_not_recorded(client):
    account = register(client)
    post(client, account, "   ")
    assert listed(client, account) == []


def test_a_search_is_trimmed_before_it_is_stored(client):
    """' zoro ' and 'zoro' are the same search; storing both makes the panel repeat."""
    account = register(client)
    post(client, account, "zoro")
    post(client, account, "  zoro  ")
    assert listed(client, account) == ["zoro"]


def test_clearing_empties_the_list(client):
    account = register(client)
    post(client, account, "zoro")
    assert client.delete("/search-history", headers=account["headers"]).status_code == 204
    assert listed(client, account) == []


def test_one_persons_searches_are_not_another_persons(client):
    alice = register(client)
    bob = register(client, email="b@example.com", invited_by=alice)
    post(client, alice, "zoro")

    assert listed(client, alice) == ["zoro"]
    assert listed(client, bob) == []


def test_clearing_only_empties_your_own(client):
    alice = register(client)
    bob = register(client, email="b@example.com", invited_by=alice)
    post(client, alice, "zoro")
    post(client, bob, "luffy")

    client.delete("/search-history", headers=bob["headers"])
    assert listed(client, alice) == ["zoro"]


def test_the_history_needs_an_account(client):
    assert client.get("/search-history").status_code == 401
