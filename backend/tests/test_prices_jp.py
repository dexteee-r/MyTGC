"""The JP price importer's parsing and matching rules.

None of this touches the network -- `SetPageParser`, `parse_price`, `slug_for` and
`accumulate_plain_prices` are all pure or operate on a fixed HTML string, the same
split `test_prices.py` already relies on for the English importer's `pair`.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from import_prices_jp import (  # noqa: E402
    SetPageParser,
    accumulate_plain_prices,
    parse_price,
    slug_for,
)

# A trimmed real page: one plain printing, one card mid-sale (a `<del>` beside the
# current price -- the thing this parser must not pick up), and a parallel plus its
# further "super parallel" tier under the same card number, mirroring the actual
# OP15-118 / OP15-060 listings the script was built against.
SAMPLE_PAGE = """
<html><body>
<div class="card-product position-relative mt-4  ">
  <img src="/x.jpg" alt="OP15-119 SEC モンキー・D・ルフィ" class="card img-fluid">
  <span class="d-block border border-dark p-1 w-100 text-center my-2">OP15-119</span>
  <strong class="d-block text-end ">
    980 円
  </strong>
</div>
<div class="card-product position-relative mt-4  sale  ">
  <img src="/x.jpg" alt="OP15-060 P-SR エネル(パラレル)" class="card img-fluid">
  <span class="d-block border border-dark p-1 w-100 text-center my-2">OP15-060</span>
  <strong class="d-block text-end  text-danger ">
    680 円
  </strong>
  <div class="form-check p-0">
    <label class="form-check-label fw-bold float-start cart_sell_zaiko">在庫 : ○</label>
    <small class="d-block text-end fs-9"><del>980 円</del></small>
  </div>
</div>
<div class="card-product position-relative mt-4  ">
  <img src="/x.jpg" alt="OP15-118 P-SEC エネル(パラレル)" class="card img-fluid">
  <span class="d-block border border-dark p-1 w-100 text-center my-2">OP15-118</span>
  <strong class="d-block text-end ">
    2,980 円
  </strong>
</div>
<div class="card-product position-relative mt-4  ">
  <img src="/x.jpg" alt="OP15-118 P-SEC エネル(パラレル)(スーパーパラレル)" class="card img-fluid">
  <span class="d-block border border-dark p-1 w-100 text-center my-2">OP15-118</span>
  <strong class="d-block text-end ">
    99,800 円
  </strong>
</div>
</body></html>
"""


def parse(html: str) -> list[dict]:
    parser = SetPageParser()
    parser.feed(html)
    return parser.cards


# --- SetPageParser ------------------------------------------------------------------

def test_finds_every_listing_on_the_page():
    cards = parse(SAMPLE_PAGE)
    assert len(cards) == 4


def test_reads_code_rarity_and_name_from_the_image_alt_text():
    cards = parse(SAMPLE_PAGE)
    plain = next(c for c in cards if c["code"] == "OP15-119")
    assert plain["rarity"] == "SEC"
    assert "ルフィ" in plain["name"]


def test_takes_the_current_price_not_the_struck_through_one():
    """The card mid-sale: 680円 is what it actually sells for now, 980円 (in the
    <del>) is what it sold for before. Grabbing the <del> instead would overstate
    the price of exactly the cards a shopper would most want to know were on sale."""
    cards = parse(SAMPLE_PAGE)
    on_sale = next(c for c in cards if c["code"] == "OP15-060")
    assert parse_price(on_sale["price"]) == 680


def test_a_card_and_its_further_super_parallel_tier_stay_distinct():
    """Both OP15-118 P-SEC listings are real, at prices 33x apart -- collapsing them
    (e.g. by only keeping the first block for a code) would silently drop one."""
    cards = [c for c in parse(SAMPLE_PAGE) if c["code"] == "OP15-118"]
    assert len(cards) == 2
    prices = {parse_price(c["price"]) for c in cards}
    assert prices == {2980, 99800}


# --- parse_price ----------------------------------------------------------------

def test_strips_the_yen_sign_and_thousands_separator():
    assert parse_price("\n2,980 円\n") == 2980


def test_a_blank_price_is_none_not_a_crash():
    assert parse_price(None) is None
    assert parse_price("") is None


# --- slug_for -------------------------------------------------------------------

def test_strips_the_hyphen_and_lowercases():
    assert slug_for("OP-15") == "op15"
    assert slug_for("ST-30") == "st30"
    assert slug_for("EB-02") == "eb02"


def test_a_code_with_no_plain_prefix_number_shape_is_skipped():
    """Promos and DON!! carry no pack_code that fits PREFIX-NN at all (None reaches
    here directly); anything unrecognised must not be guessed into a URL that could
    point at the wrong set's page."""
    assert slug_for(None) is None
    assert slug_for("") is None
    assert slug_for("Something Else") is None


# --- accumulate_plain_prices ------------------------------------------------------

def test_parallels_never_reach_the_price_map():
    by_number: dict[str, int] = {}
    accumulate_plain_prices(parse(SAMPLE_PAGE), by_number)
    assert "OP15-118" not in by_number  # only P-SEC listings exist for this number
    assert "OP15-060" not in by_number  # only a P-SR listing exists for this number


def test_the_plain_printing_is_priced():
    by_number: dict[str, int] = {}
    accumulate_plain_prices(parse(SAMPLE_PAGE), by_number)
    assert by_number == {"OP15-119": 980}


def test_first_non_null_wins_on_a_repeat_number():
    """Mirrors import_prices.py's own rule for tcgcsv, applied here in case a set
    ever lists a number twice (not observed, but not assumed away either)."""
    by_number: dict[str, int] = {}
    accumulate_plain_prices(
        [{"code": "OP01-001", "rarity": "L", "name": "x", "price": "100 円"}], by_number,
    )
    accumulate_plain_prices(
        [{"code": "OP01-001", "rarity": "L", "name": "x", "price": "999 円"}], by_number,
    )
    assert by_number == {"OP01-001": 100}
