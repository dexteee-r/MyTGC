"""The illustrator importer's parsing and merge rules.

None of this touches the network -- `ArtistPageParser` runs against a fixed HTML
string and `merge_slug_results` is a pure function, the same split test_prices.py
and test_prices_jp.py already rely on for their own importers.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from import_artists import ArtistPageParser, merge_slug_results  # noqa: E402

# A trimmed real page: two prints of one card (its base art, credited to Nakamaru,
# and -- unrealistically for this actual number, but exercising the real shape --
# a `?v=1` alternate art by a different artist), plus one more base card.
SAMPLE_PAGE = """
<html><body>
<div class="card-page-main"><div class="card-profile">
  <div class="card-details"><div class="card-text">
    <div class="card-text-section"><p class="card-text-title">
      <span class="card-text-name"><a href="/cards/en/OP16-025">Bunkov</a></span>
      <span class="card-text-id">OP16-025</span>
    </p></div>
    <div class="card-text-section card-text-artist">
      Illustrated by <a href="/cards/en?q=!artist:nakamaru">Nakamaru</a>
    </div>
  </div></div>
</div></div>
<div class="card-page-main"><div class="card-profile">
  <div class="card-details"><div class="card-text">
    <div class="card-text-section"><p class="card-text-title">
      <span class="card-text-name"><a href="/cards/en/OP16-025?v=1">Bunkov (Parallel)</a></span>
      <span class="card-text-id">OP16-025</span>
    </p></div>
    <div class="card-text-section card-text-artist">
      Illustrated by <a href="/cards/en?q=!artist:someoneelse">Someone Else</a>
    </div>
  </div></div>
</div></div>
<div class="card-page-main"><div class="card-profile">
  <div class="card-details"><div class="card-text">
    <div class="card-text-section"><p class="card-text-title">
      <span class="card-text-name"><a href="/cards/en/OP15-070">Fuza</a></span>
      <span class="card-text-id">OP15-070</span>
    </p></div>
    <div class="card-text-section card-text-artist">
      Illustrated by <a href="/cards/en?q=!artist:nakamaru">Nakamaru</a>
    </div>
  </div></div>
</div></div>
</body></html>
"""


def parse(html: str) -> list[tuple[str, bool, str]]:
    parser = ArtistPageParser()
    parser.feed(html)
    return parser.results


# --- ArtistPageParser ------------------------------------------------------------

def test_finds_every_credited_print():
    assert len(parse(SAMPLE_PAGE)) == 3


def test_a_plain_link_is_not_a_variant():
    base = next(r for r in parse(SAMPLE_PAGE) if r[2] == "Nakamaru" and r[0] == "OP16-025")
    assert base[1] is False


def test_a_v_suffixed_link_is_a_variant():
    variant = next(r for r in parse(SAMPLE_PAGE) if r[2] == "Someone Else")
    assert variant[0] == "OP16-025"
    assert variant[1] is True


def test_bare_code_without_language_prefix_also_parses():
    # Some requests return /cards/CODE directly, without the en/jp segment
    # lang=all adds -- both shapes have to work, not just the one sampled above.
    html = SAMPLE_PAGE.replace("/cards/en/OP15-070", "/cards/OP15-070")
    result = next(r for r in parse(html) if r[0] == "OP15-070")
    assert result == ("OP15-070", False, "Nakamaru")


# --- merge_slug_results ------------------------------------------------------------

def test_the_common_case_just_records_the_base_print():
    by_number: dict[str, str] = {}
    name, base, variants = merge_slug_results(
        [("OP16-025", False, "Nakamaru"), ("OP15-070", False, "Nakamaru")],
        "nakamaru", by_number, set(),
    )
    assert by_number == {"OP16-025": "Nakamaru", "OP15-070": "Nakamaru"}
    assert (name, base, variants) == ("Nakamaru", 2, 0)


def test_a_variant_print_is_counted_but_never_recorded():
    by_number: dict[str, str] = {}
    merge_slug_results(
        [("OP16-025", True, "Someone Else")], "someoneelse", by_number, set(),
    )
    assert by_number == {}


def test_two_different_artists_for_one_number_drop_it_rather_than_pick_one():
    """The real case this whole rule exists for: ST01-011 (Brook) turned up
    credited to two unrelated artists across real reprints the search result
    cannot tell apart -- neither claim should win by accident of scrape order."""
    by_number = {"ST01-011": "Hayaken-sarena"}
    conflicted: set[str] = set()
    merge_slug_results(
        [("ST01-011", False, "Ono Tako")], "ono_tako", by_number, conflicted,
    )
    assert "ST01-011" not in by_number
    assert conflicted == {"ST01-011"}


def test_a_conflicted_number_stays_dropped_even_if_a_third_artist_repeats_it():
    by_number: dict[str, str] = {}
    conflicted = {"ST01-011"}
    merge_slug_results(
        [("ST01-011", False, "A Third Artist")], "third", by_number, conflicted,
    )
    assert "ST01-011" not in by_number


def test_a_casing_difference_for_the_same_search_is_not_a_conflict():
    """The real "sowsow" vs "SOWSOW" case: two reprints of the same card render
    the same real person's name with different casing. Using one name for the
    whole batch (not the per-print string) means this never reaches the
    conflict rule at all."""
    by_number: dict[str, str] = {}
    merge_slug_results(
        [("ST08-002", False, "sowsow"), ("OP01-006", False, "SOWSOW")],
        "sowsow", by_number, set(),
    )
    assert by_number == {"ST08-002": "sowsow", "OP01-006": "sowsow"}


def test_an_artist_with_zero_results_still_reports_something_readable():
    name, base, variants = merge_slug_results([], "nobody-drew-anything", {}, set())
    assert (name, base, variants) == ("nobody-drew-anything", 0, 0)
