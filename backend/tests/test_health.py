"""/health's catalogue vs cards_total split.

`catalogue` is punk-records provenance (source/commit/date), written only by
import_catalogue.py. A card added by a different importer (import_don_cards.py,
or any future one) never touches that table, so `catalogue` alone cannot answer
"how many cards are really in the database" once a second source exists --
`cards_total` is the live count that does, the same way `hashed_cards` already is.
"""


def test_cards_total_counts_every_row_even_without_catalogue_meta(client):
    """The fixture seeds `cards` directly and never touches `catalogue_meta` --
    exactly the shape a non-punk-records import (DON!! cards) leaves behind on a
    real database: rows that exist, with no provenance entry describing them."""
    body = client.get("/health").json()

    assert body["catalogue"] == {}
    assert body["cards_total"] == {"en": 3, "jp": 1}
