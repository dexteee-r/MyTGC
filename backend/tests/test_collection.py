"""Collection semantics, and the hash storage the recognition pipeline depends on."""

from conftest import register

from app import hashing


def test_adding_a_card_twice_increments_one_holding(client):
    """It used to insert a second row, so the same card appeared twice with
    separate counts, which is not what "add this card" means."""
    account = register(client)
    for _ in range(3):
        client.post(
            "/collection",
            json={"card_id": "OP01-001", "language": "en", "condition": "near_mint"},
            headers=account["headers"],
        )

    holdings = client.get("/collection", headers=account["headers"]).json()
    assert len(holdings) == 1
    assert holdings[0]["quantity"] == 3


def test_a_different_condition_is_a_separate_holding(client):
    """A Near Mint and a Played copy are genuinely different things to a collector."""
    account = register(client)
    for condition in ("near_mint", "lightly_played"):
        client.post(
            "/collection",
            json={"card_id": "OP01-001", "language": "en", "condition": condition},
            headers=account["headers"],
        )

    holdings = client.get("/collection", headers=account["headers"]).json()
    assert len(holdings) == 2
    assert {h["condition"] for h in holdings} == {"near_mint", "lightly_played"}


def test_the_two_editions_are_separate_holdings(client):
    account = register(client)
    for language in ("en", "jp"):
        client.post(
            "/collection",
            json={"card_id": "OP01-001", "language": language},
            headers=account["headers"],
        )
    assert len(client.get("/collection", headers=account["headers"]).json()) == 2


def test_dropping_to_zero_removes_the_holding(client):
    """A zero-quantity row would make every count and filter lie."""
    account = register(client)
    entry = client.post(
        "/collection",
        json={"card_id": "OP01-001", "language": "en"},
        headers=account["headers"],
    ).json()

    client.patch(
        f"/collection/{entry['id']}", json={"quantity": 0}, headers=account["headers"]
    )
    assert client.get("/collection", headers=account["headers"]).json() == []


def test_adding_a_card_that_does_not_exist_is_refused(client):
    account = register(client)
    response = client.post(
        "/collection",
        json={"card_id": "ZZ99-999", "language": "en"},
        headers=account["headers"],
    )
    assert response.status_code == 404


def test_sibling_printings_are_listed_on_the_detail(client):
    account = register(client)
    card = client.get("/cards/OP01-002?language=en", headers=account["headers"]).json()
    assert card["printings"] == ["OP01-002_p1"]


def test_an_image_path_cannot_escape_the_cache(client):
    """The filename is user input; '..' would otherwise walk out of the directory."""
    assert client.get("/images/en/../../mytgc.db").status_code == 404


# --- hash storage ---------------------------------------------------------------

def test_signed_storage_round_trips_a_64_bit_hash():
    """SQLite INTEGER is signed and silently promotes anything above 2**63-1 to a
    float, destroying the low bits — so the bit pattern is reinterpreted instead."""
    for value in (0, 1, 2**63 - 1, 2**63, 2**64 - 1, 0xDEADBEEFCAFEBABE):
        stored = hashing.to_signed(value)
        assert -(2**63) <= stored <= 2**63 - 1
        assert hashing.from_signed(stored) == value


def test_hamming_distance_counts_differing_bits():
    assert hashing.hamming(0b1011, 0b1011) == 0
    assert hashing.hamming(0b1011, 0b1010) == 1
    assert hashing.hamming(0, 2**64 - 1) == 64
    assert hashing.hamming_rgb((0, 0, 0), (2**64 - 1,) * 3) == 192
