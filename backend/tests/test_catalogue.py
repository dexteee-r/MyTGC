"""The /cards endpoint: what you can ask the catalogue and in what order it answers.

This is the most-used endpoint in the app and it had no test at all. Everything the
filter panel can send ends up here, and several of these rules were got wrong once
already — the sort that claimed to be chronological and was not, and the colour filter
that has to match a JSON array element rather than a substring.
"""

from conftest import register

from app import db

EXTRA = (
    # id, language, name, pack_code, rarity, colors, release_date
    ("OP02-001", "en", "Ace & Newgate", "OP-02", "SuperRare", '["Red"]', "2023-03-10"),
    ("OP02-002", "en", "Blackbeard", "OP-02", "Common", '["Black"]', "2023-03-10"),
    ("EB01-001", "en", "Kouzuki Oden", "EB-01", "Rare", '["Green","Blue"]', "2024-05-03"),
)


def seed_extra():
    """Cards on top of the four the fixture lays down, with dates the seeds lack."""
    conn = db.connect()
    conn.executemany(
        "INSERT INTO cards (id, language, name, pack_id, pack_code, pack_name, rarity,"
        " category, colors, release_date)"
        " VALUES (?, ?, ?, '569102', ?, 'PACK', ?, 'Character', ?, ?)",
        EXTRA,
    )
    conn.commit()
    conn.close()


def ids(response):
    return [c["id"] for c in response.json()["items"]]


def search(client, account, **params):
    return client.get("/cards", params=params, headers=account["headers"])


# --- finding ----------------------------------------------------------------------

def test_every_word_must_match_and_order_does_not_count(client):
    """Nobody types "Ace &amp; Newgate" exactly, and a single LIKE over the whole
    string fails on "newgate ace" and on the ampersand alike."""
    account = register(client)
    seed_extra()
    assert ids(search(client, account, q="newgate ace")) == ["OP02-001"]


def test_a_word_that_matches_nothing_empties_the_result(client):
    account = register(client)
    seed_extra()
    assert ids(search(client, account, q="ace zoro")) == []


def test_a_card_can_be_found_by_a_fragment_of_its_code(client):
    account = register(client)
    seed_extra()
    assert ids(search(client, account, q="EB01")) == ["EB01-001"]


# --- filtering --------------------------------------------------------------------

def test_two_rarities_widen_the_result_rather_than_emptying_it(client):
    """Ticking Rare and SuperRare is "either", the way a filter panel reads."""
    account = register(client)
    seed_extra()
    both = ids(search(client, account, rarity=["Rare", "SuperRare"], language="en"))
    assert set(both) == {"OP01-002", "OP01-002_p1", "OP02-001", "EB01-001"}


def test_a_colour_matches_the_array_element_and_not_a_substring(client):
    """colors is stored as JSON, so the clause matches '"Black"' quoted — otherwise a
    filter on Black would also catch a card printed in Blackish, or in Blue."""
    account = register(client)
    seed_extra()
    assert ids(search(client, account, color=["Black"], language="en")) == ["OP02-002"]


def test_a_card_matches_if_any_of_its_colours_is_asked_for(client):
    account = register(client)
    seed_extra()
    assert "EB01-001" in ids(search(client, account, color=["Blue"], language="en"))


def test_the_edition_filter_separates_two_printings_of_one_number(client):
    account = register(client)
    assert ids(search(client, account, language="jp")) == ["OP01-001"]


def test_owned_splits_the_catalogue_in_two(client):
    account = register(client)
    seed_extra()
    client.post("/collection", json={"card_id": "OP02-001", "language": "en"},
                headers=account["headers"])

    assert ids(search(client, account, owned=True)) == ["OP02-001"]
    assert "OP02-001" not in ids(search(client, account, owned=False))


def test_owned_is_scoped_to_the_person_asking(client):
    alice = register(client)
    bob = register(client, email="b@example.com", invited_by=alice)
    seed_extra()
    client.post("/collection", json={"card_id": "OP02-001", "language": "en"},
                headers=alice["headers"])

    assert ids(search(client, alice, owned=True)) == ["OP02-001"]
    assert ids(search(client, bob, owned=True)) == []


# --- ordering ---------------------------------------------------------------------

def test_sorting_by_date_puts_the_newest_first_and_the_undated_last(client):
    """The seeded cards carry no release date. They belong at the end, not at the
    front — an empty string sorts above every real date, which would lead with the
    promos."""
    account = register(client)
    seed_extra()
    order = ids(search(client, account, sort="date", language="en", limit=200))

    assert order[:3] == ["EB01-001", "OP02-001", "OP02-002"]
    assert set(order[3:]) == {"OP01-001", "OP01-002", "OP01-002_p1"}


def test_sorting_by_name_is_alphabetical(client):
    account = register(client)
    seed_extra()
    page = search(client, account, sort="name", language="en", limit=200).json()

    assert [c["name"] for c in page["items"]][:4] == [
        "Ace & Newgate", "Blackbeard", "Kouzuki Oden", "Monkey.D.Luffy",
    ]


def test_an_unknown_sort_falls_back_instead_of_failing(client):
    account = register(client)
    assert search(client, account, sort="nonsense").status_code == 200


def test_sorting_by_price_puts_the_unpriced_last_in_either_direction(client):
    """Unpriced is not "cheapest" -- a card nobody has priced yet must not lead
    an ascending sort just because absence sorts low."""
    account = register(client)
    seed_extra()
    conn = db.connect()
    conn.executemany(
        "INSERT INTO price_history (card_id, language, source, price, currency,"
        " captured_at) VALUES (?, 'en', 'test', ?, 'EUR', '2026-08-15')",
        [("OP02-001", 40.0), ("OP02-002", 5.0), ("EB01-001", 15.0)],
    )
    conn.commit()
    conn.close()

    ascending = ids(search(client, account, sort="price_asc", language="en", limit=200))
    descending = ids(search(client, account, sort="price_desc", language="en", limit=200))

    assert ascending[:3] == ["OP02-002", "EB01-001", "OP02-001"]
    assert descending[:3] == ["OP02-001", "EB01-001", "OP02-002"]
    # OP01-001/OP01-002/OP01-002_p1 have no price_history row: last, both ways.
    assert ascending[3:] == descending[3:]


# --- paging -----------------------------------------------------------------------

def test_the_total_counts_the_whole_result_not_the_page(client):
    account = register(client)
    seed_extra()
    page = search(client, account, language="en", limit=2).json()

    assert len(page["items"]) == 2
    assert page["total"] == 6
    assert (page["offset"], page["limit"]) == (0, 2)


def test_paging_walks_the_result_without_repeating_a_card(client):
    account = register(client)
    seed_extra()
    first = ids(search(client, account, language="en", limit=3, offset=0))
    second = ids(search(client, account, language="en", limit=3, offset=3))

    assert len(set(first) & set(second)) == 0
    assert len(set(first) | set(second)) == 6


# --- what a card carries ----------------------------------------------------------

def test_a_card_carries_its_release_date_and_its_price(client):
    """Both are read off the card wherever one is shown — the sheet, the want list, a
    scan result — so they have to survive the trip through the list endpoint too."""
    account = register(client)
    seed_extra()
    conn = db.connect()
    conn.execute(
        "INSERT INTO price_history (card_id, language, source, price, currency,"
        " captured_at) VALUES ('OP02-001', 'en', 'test', 9.5, 'EUR', '2026-08-15')")
    conn.commit()
    conn.close()

    card = search(client, account, q="newgate").json()["items"][0]
    assert card["release_date"] == "2023-03-10"
    assert card["market_price"] == 9.5


def test_a_card_with_no_snapshot_reports_no_price_rather_than_zero(client):
    """Zero would be a claim about the market; null is the absence of one."""
    account = register(client)
    seed_extra()
    card = search(client, account, q="Blackbeard").json()["items"][0]
    assert card["market_price"] is None


def test_the_price_shown_is_the_latest_snapshot(client):
    account = register(client)
    seed_extra()
    conn = db.connect()
    conn.executemany(
        "INSERT INTO price_history (card_id, language, source, price, currency,"
        " captured_at) VALUES ('OP02-001', 'en', 'test', ?, 'EUR', ?)",
        [(1.0, "2026-08-13"), (99.0, "2026-08-14"), (7.0, "2026-08-15")],
    )
    conn.commit()
    conn.close()

    assert search(client, account, q="newgate").json()["items"][0]["market_price"] == 7.0


def test_a_price_does_not_cross_from_one_edition_to_the_other(client):
    """EN and JP share card numbers, so the join has to bind the language too."""
    account = register(client)
    conn = db.connect()
    conn.execute(
        "INSERT INTO price_history (card_id, language, source, price, currency,"
        " captured_at) VALUES ('OP01-001', 'en', 'test', 12.0, 'EUR', '2026-08-15')")
    conn.commit()
    conn.close()

    japanese = search(client, account, language="jp").json()["items"][0]
    assert japanese["market_price"] is None


def test_the_catalogue_needs_an_account(client):
    assert client.get("/cards").status_code == 401
