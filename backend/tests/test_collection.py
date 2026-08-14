"""Collection semantics, and the hash storage the recognition pipeline depends on."""

from conftest import register

from app import db, hashing


def snapshot(card_id, language, price, captured_at, source="tcgcsv/tcgplayer"):
    connection = db.connect()
    connection.execute(
        "INSERT INTO price_history (card_id, language, source, price, currency,"
        " captured_at) VALUES (?, ?, ?, ?, 'EUR', ?)",
        (card_id, language, source, price, captured_at),
    )
    connection.commit()
    connection.close()


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
    assert client.get("/images/en/../../mytcg.db").status_code == 404


# --- what the collection is worth -------------------------------------------------

def test_only_the_latest_snapshot_values_a_card(client):
    """price_history keeps one row per day so a chart can be drawn later. Summing it
    raw would multiply the collection by the number of days the importer has run."""
    account = register(client)
    client.post("/collection", json={"card_id": "OP01-001", "language": "en"},
                headers=account["headers"])
    for day, price in (("2026-08-12", 5.0), ("2026-08-13", 9.0), ("2026-08-14", 7.0)):
        snapshot("OP01-001", "en", price, day)

    stats = client.get("/collection/stats", headers=account["headers"]).json()
    assert stats["market_total"] == 7.0
    assert stats["market_priced"] == 1


def test_the_value_follows_the_number_of_copies(client):
    account = register(client)
    entry = client.post("/collection", json={"card_id": "OP01-001", "language": "en"},
                        headers=account["headers"]).json()
    client.patch(f"/collection/{entry['id']}", json={"quantity": 4},
                 headers=account["headers"])
    snapshot("OP01-001", "en", 2.5, "2026-08-14")

    stats = client.get("/collection/stats", headers=account["headers"]).json()
    assert stats["market_total"] == 10.0
    assert stats["market_priced"] == 4


def test_an_uncosted_card_is_left_out_of_the_total_and_counted_as_such(client):
    """The Japanese printing has no feed and the alternate arts are deliberately
    unpriced, so a total on its own would read as an appraisal of the whole binder."""
    account = register(client)
    for card_id, language in (("OP01-001", "en"), ("OP01-001", "jp"),
                              ("OP01-002_p1", "en")):
        client.post("/collection", json={"card_id": card_id, "language": language},
                    headers=account["headers"])
    snapshot("OP01-001", "en", 3.0, "2026-08-14")

    stats = client.get("/collection/stats", headers=account["headers"]).json()
    assert stats["total_quantity"] == 3
    assert stats["market_total"] == 3.0
    assert stats["market_priced"] == 1


def test_a_price_does_not_leak_between_editions(client):
    """EN and JP share card numbers; pricing one off the other's row would be wrong."""
    account = register(client)
    client.post("/collection", json={"card_id": "OP01-001", "language": "jp"},
                headers=account["headers"])
    snapshot("OP01-001", "en", 12.0, "2026-08-14")

    stats = client.get("/collection/stats", headers=account["headers"]).json()
    assert stats["market_total"] == 0
    assert stats["market_priced"] == 0


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
