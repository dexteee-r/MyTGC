"""The price importer's matching rules, and the shape of the release-date table.

Both are hand-maintained data touching a lot of cards, and both have already been wrong
in ways nothing caught: prices were pooled across sets so an alternate art inherited a
promo reprint's figure, and the release table was keyed on a code that two English sets
share. Neither needs the network — `pair` is pure, and RELEASE_DATES is a literal.
"""

import re
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from app.release_dates import RELEASE_DATES  # noqa: E402
from import_prices import is_plain, key, pair  # noqa: E402

RATE = 0.5  # halves the dollar figure, so a conversion slip is obvious in the assert
TODAY = "2026-08-15"


def prices(rows):
    """card_id -> euro price, from the tuples `pair` builds for executemany."""
    return {r[0]: r[3] for r in rows}


# --- telling a plain printing from a parallel -------------------------------------

@pytest.mark.parametrize("name", [
    "Shanks (028)",           # the parenthetical is the collector number
    "Ace & Sabo & Luffy",     # no parenthetical at all
    "Monkey.D.Luffy (001)",
])
def test_a_plain_printing_is_recognised(name):
    assert is_plain(name)


@pytest.mark.parametrize("name", [
    "Shanks (028) (Alternate Art)",
    "Monkey.D.Garp (Alternate Art)",
    "Yamato (Parallel)",
    "Shanks - OP09-004 (SP) (Gold)",   # a reprint carries its code inline
])
def test_a_parallel_is_recognised(name):
    assert not is_plain(name)


def test_set_codes_normalise_across_both_spellings():
    """tcgcsv writes 'OP17' but 'ST-31' and 'EB-05'; ours are always hyphenated."""
    assert key("OP-01") == key("OP01") == "OP01"
    assert key("ST-31") == "ST31"
    assert key("OP17 RE") == "OP17RE"


# --- pairing ----------------------------------------------------------------------

def test_the_plain_card_takes_the_plain_price():
    rows, unpriced, ambiguous = pair(
        {"OP01-001": ["OP01-001"]},
        {"OP01-001": [("Monkey.D.Luffy (001)", 10.0)]},
        RATE, TODAY,
    )
    assert prices(rows) == {"OP01-001": 5.0}
    assert (unpriced, ambiguous) == (0, 0)


def test_one_variant_against_one_parallel_is_paired():
    rows, unpriced, _ = pair(
        {"OP01-001": ["OP01-001", "OP01-001_p1"]},
        {"OP01-001": [("Luffy (001)", 10.0), ("Luffy (001) (Alternate Art)", 300.0)]},
        RATE, TODAY,
    )
    assert prices(rows) == {"OP01-001": 5.0, "OP01-001_p1": 150.0}
    assert unpriced == 0


def test_variants_are_left_unpriced_when_the_two_sources_disagree_on_how_many():
    """The real OP01-121: we hold four parallels, tcgcsv lists one. Guessing which is
    which would have handed a 5 EUR card the 135 EUR figure, or the reverse."""
    rows, unpriced, ambiguous = pair(
        {"OP01-121": ["OP01-121", "OP01-121_p1", "OP01-121_p2", "OP01-121_r1"]},
        {"OP01-121": [("Yamato", 10.0), ("Yamato (Parallel)", 270.0)]},
        RATE, TODAY,
    )
    assert prices(rows) == {"OP01-121": 5.0}, "only the plain card may be priced"
    assert unpriced == 3
    assert ambiguous == 3


def test_a_card_absent_from_the_feed_is_counted_not_invented():
    rows, unpriced, ambiguous = pair(
        {"OP99-001": ["OP99-001"]}, {}, RATE, TODAY,
    )
    assert rows == []
    assert unpriced == 1
    # Nothing to be ambiguous about: the feed simply does not carry the card.
    assert ambiguous == 0


def test_variants_alone_are_not_charged_to_the_ambiguity_count():
    """No parallel on the feed side is a plain gap, not a pairing the code refused."""
    _, unpriced, ambiguous = pair(
        {"OP01-001": ["OP01-001", "OP01-001_p1"]},
        {"OP01-001": [("Luffy (001)", 10.0)]},
        RATE, TODAY,
    )
    assert unpriced == 1
    assert ambiguous == 0


def test_every_row_is_stamped_for_the_run_it_belongs_to():
    rows, _, _ = pair(
        {"OP01-001": ["OP01-001"]},
        {"OP01-001": [("Luffy (001)", 10.0)]},
        RATE, TODAY,
    )
    card_id, language, source, price, currency, captured_at = rows[0]
    assert (language, currency, captured_at) == ("en", "EUR", TODAY)
    assert source and price == 5.0 and card_id == "OP01-001"


# --- the release-date table -------------------------------------------------------

ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def test_every_release_date_is_a_real_iso_date():
    for pack_id, value in RELEASE_DATES.items():
        assert ISO.match(value), f"{pack_id} -> {value!r}"
        date.fromisoformat(value)


def test_the_table_covers_both_editions_and_keeps_them_apart():
    """Keyed by pack_id, not pack_code: EN (569xxx) and JP (550xxx) ship the same set
    on different days, and keying on the code would collapse the two."""
    english = {k for k in RELEASE_DATES if k.startswith("569")}
    japanese = {k for k in RELEASE_DATES if k.startswith("550")}
    assert len(english) >= 55 and len(japanese) >= 55
    assert english | japanese == set(RELEASE_DATES), "an unexpected pack_id prefix"


def test_the_two_editions_of_a_set_ship_within_a_year_of_each_other():
    """Catches a transposition — a date copied onto the wrong row lands years out.

    Deliberately not "Japan always ships first", which is the obvious rule and is
    false: the six colour starter decks ST-23..ST-28 came out in English on
    2025-06-06 and in Japanese on 2025-06-28, three weeks later. Both official
    archives agree, so the band has to allow the English edition to lead.
    Observed range across the table: -22 to +181 days.
    """
    for jp_id, jp_date in ((k, v) for k, v in RELEASE_DATES.items() if k.startswith("550")):
        en_date = RELEASE_DATES.get("569" + jp_id[3:])
        if not en_date:
            continue
        gap = (date.fromisoformat(en_date) - date.fromisoformat(jp_date)).days
        assert -60 <= gap <= 400, f"{jp_id}: {jp_date} vs {en_date} ({gap} jours)"


def test_the_dates_sit_in_the_lifetime_of_the_game():
    """The game launched in July 2022. A 2021 date is a typo; so is 2036."""
    for pack_id, value in RELEASE_DATES.items():
        assert "2022-07-01" <= value <= "2030-01-01", f"{pack_id} -> {value}"
