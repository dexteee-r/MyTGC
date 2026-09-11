"""Snapshot Japanese card prices from yuyu-tei.jp into price_history, in euros.

Usage:
    py backend/scripts/import_prices_jp.py [--dry-run]

Companion to import_prices.py, which only ever prices the English catalogue --
TCGplayer sells the English printing, and no free feed exists for the Japanese
one, so JP cards have always carried no price at all. yuyu-tei.jp is a real
card shop (not an aggregator), and lists its current retail price per card on
one HTML page per set, e.g. yuyu-tei.jp/sell/opc/s/op15 -- static markup, no
JavaScript to run, and its robots.txt carries no blanket Disallow, only named
crawl-delays for Bing/Ahrefs/Yahoo's Slurp. Checked directly before writing a
line of this: unlike Cardmarket, nothing here refuses an unnamed client, and
no terms page found claims the presentation of prices requires a written
agreement -- the one thing that would have stopped this the way it stopped
Cardmarket.

The price taken is the shop's current sell price (the 売価) -- a `<del>`
struck-through figure beside it is only a temporary discount marker, not a
second price -- matching the "retail" semantics README.md already chose for
the English side over 買取 (the shop's buy-back price, always lower). Yen is
converted to euros at the day's ECB reference rate, the same source and the
same reasoning as the USD conversion next door: one unit throughout the app,
never a mix.

Only plain printings are priced, deliberately less ambitious than the English
side's alternate-art pairing. Measured on the actual catalogue before writing
this: a card number here carries anywhere from 1 to 11 printings (reprints,
parallels, a further "super parallel" tier within parallels, promo
re-releases of a starter card...), far past the two-way case import_prices.py
already calls its riskiest logic. Position-pairing an 11-way tie the way the
English side pairs a 2-way one would be a guess wearing a formula's clothes.
So every `_p1`/`_r1`/... suffix goes unpriced here, full stop -- no attempt at
pairing them to yuyu-tei's own "(パラレル)"/"(スーパーパラレル)" tiers. The
plain printing (no suffix) is still unambiguous: one number, one shop listing
with a non-parallel rarity, exactly as reliable as the English base card.

Only the numbered boosters, starters, EB and PRB sets are covered -- derived
from this catalogue's own pack_code (`OP-15` -> `op15`), not scraped from
yuyu-tei's navigation, so a set this database does not know about is simply
never requested. Promo cards and DON!! (no pack_code) are out of scope: their
yuyu-tei listings live under numbered sub-pages (`s/special/4/`) rather than
one page per set, a different shape this script does not attempt to walk.
"""

import argparse
import re
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db
from app.config import DB_PATH

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

BASE = "https://yuyu-tei.jp"

# A real shop's product listing, not a static mirror -- kept slower than
# tcgcsv's own 0.25s out of caution, though nothing in robots.txt demands it.
AGENT = "MyTCG/1.0 (personal collection tracker; contact via github)"
PAUSE = 0.6

FX = "https://api.frankfurter.dev/v1/latest?base=JPY&symbols=EUR"
SOURCE = "yuyu-tei"

PRICE_DIGITS = re.compile(r"[\d,]+")


def get_html(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def jpy_to_eur() -> float:
    import json
    request = urllib.request.Request(FX, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        rate = json.loads(response.read().decode("utf-8"))["rates"]["EUR"]
    # A yen is worth a small fraction of a euro -- roughly 1/160 at the time
    # this was written. Bounded loosely so a malformed response fails loudly
    # rather than pricing the whole JP catalogue at some absurd figure.
    if not 0.003 < rate < 0.02:
        raise SystemExit(f"refusing an implausible JPY->EUR rate: {rate}")
    return rate


def slug_for(pack_code: str) -> str | None:
    """'OP-15' -> 'op15', 'ST-30' -> 'st30', 'EB-02' -> 'eb02'. None for
    anything without the plain PREFIX-NN shape this catalogue's numbered sets
    all share (promos and DON!! carry no pack_code at all and are filtered
    out before this is ever called)."""
    match = re.fullmatch(r"([A-Z]+)-(\d+)", pack_code or "")
    if not match:
        return None
    return f"{match.group(1).lower()}{match.group(2)}"


class SetPageParser(HTMLParser):
    """Pulls (code, rarity, name, price) out of one yuyu-tei set page.

    Hand-rolled rather than a new dependency (BeautifulSoup, lxml): the page
    is simple, stable markup -- one `.card-product` div per listing -- and
    every earlier build step in this project stays on the standard library
    for exactly this reason. Tracks `<div>` nesting only to know when a
    card-product block closes; nothing else here needs it, since the code,
    rarity and name all arrive together in the listing's own <img alt="...">
    and the price is simply the block's first <strong> text.
    """

    def __init__(self) -> None:
        super().__init__()
        self.cards: list[dict[str, str | None]] = []
        self._depth = 0
        self._current: dict[str, str | None] | None = None
        self._in_strong = False
        self._strong_buf: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = dict(attrs)
        if self._current is None:
            if tag == "div" and "card-product" in (attr_map.get("class") or "").split():
                self._current = {"code": None, "rarity": None, "name": None, "price": None}
                self._depth = 1
            return
        if tag == "div":
            self._depth += 1
        elif tag == "img" and self._current["code"] is None:
            # "OP15-118 P-SEC エネル(パラレル)" -- code, rarity, name, always
            # in that order and always space-separated exactly twice.
            parts = (attr_map.get("alt") or "").split(" ", 2)
            if len(parts) == 3:
                self._current["code"], self._current["rarity"], self._current["name"] = parts
        elif tag == "strong" and self._current["price"] is None:
            self._in_strong = True
            self._strong_buf = []

    def handle_endtag(self, tag: str) -> None:
        if self._current is None:
            return
        if tag == "strong" and self._in_strong:
            self._in_strong = False
            self._current["price"] = "".join(self._strong_buf)
        elif tag == "div":
            self._depth -= 1
            if self._depth == 0:
                self.cards.append(self._current)
                self._current = None

    def handle_data(self, data: str) -> None:
        if self._in_strong:
            self._strong_buf.append(data)


def parse_price(raw: str | None) -> int | None:
    """'\\n2,980 円\\n' -> 2980. None for a blank <strong> (never seen in
    practice, but a page that changes shape should skip a card, not crash)."""
    if not raw:
        return None
    match = PRICE_DIGITS.search(raw)
    return int(match.group().replace(",", "")) if match else None


def fetch_set(slug: str) -> list[dict[str, str | None]]:
    parser = SetPageParser()
    parser.feed(get_html(f"{BASE}/sell/opc/s/{slug}"))
    return parser.cards


def accumulate_plain_prices(
    cards: list[dict[str, str | None]], by_number: dict[str, int],
) -> None:
    """Fold one page's parsed listings into the running number -> price map.

    Split out of `collect` so the rule itself -- skip parallels, first
    non-null wins -- is testable without a network call. Where a number lists
    more than one non-parallel entry (not observed on any set sampled while
    building this, but never assumed away), the first one wins rather than
    the page's total being silently skipped -- the same rule import_prices.py
    already applies to tcgcsv.
    """
    for entry in cards:
        code, rarity = entry["code"], entry["rarity"]
        if not code or not rarity:
            continue
        if rarity.startswith("P-"):
            continue  # a parallel tier -- out of scope, see module docstring
        price = parse_price(entry["price"])
        if price is None:
            continue
        by_number.setdefault(code, price)


def collect(slugs: list[str]) -> dict[str, int]:
    """Card number -> current JPY sell price of its plain printing."""
    by_number: dict[str, int] = {}
    for index, slug in enumerate(slugs, 1):
        try:
            cards = fetch_set(slug)
        except (urllib.error.URLError, TimeoutError) as caught:
            print(f"  ! {slug}: {caught}")
            continue
        time.sleep(PAUSE)

        accumulate_plain_prices(cards, by_number)

        if index % 15 == 0 or index == len(slugs):
            print(f"  {index}/{len(slugs)} extensions lues")
    return by_number


def main() -> int:
    parser = argparse.ArgumentParser(description="Snapshot JP prices into price_history.")
    parser.add_argument("--dry-run", action="store_true",
                         help="report coverage without writing anything")
    args = parser.parse_args()

    conn = db.connect()
    db.init_schema(conn)

    ours: dict[str, list[str]] = defaultdict(list)
    slugs: set[str] = set()
    for row in conn.execute(
        "SELECT id, pack_code FROM cards WHERE language = 'jp' AND pack_code IS NOT NULL"
    ):
        ours[row["id"].split("_")[0]].append(row["id"])
        slug = slug_for(row["pack_code"])
        if slug:
            slugs.add(slug)

    if not ours:
        print(f"Aucune carte japonaise dans {DB_PATH}.", file=sys.stderr)
        print("Vérifie MYTCG_DATA_DIR et MYTCG_DB_PATH dans l'environnement du job.",
              file=sys.stderr)
        conn.close()
        return 1
    print(f"Catalogue : {sum(len(v) for v in ours.values())} cartes japonaises,"
          f" {len(slugs)} extensions à interroger")

    rate = jpy_to_eur()
    print(f"Taux BCE du jour : 1 JPY = {rate:.6f} EUR")

    by_number = collect(sorted(slugs))
    print(f"{len(by_number)} numéros de carte cotés (tirage normal uniquement)")

    if not by_number:
        print("yuyu-tei n'a renvoyé aucun prix. Rien n'a été écrit.", file=sys.stderr)
        conn.close()
        return 1

    today = date.today().isoformat()
    rows: list[tuple] = []
    unpriced_base = unpriced_variant = 0
    for number, ids in ours.items():
        base = [i for i in ids if "_" not in i]
        variants = [i for i in ids if "_" in i]
        unpriced_variant += len(variants)  # never priced here, see module docstring

        price_jpy = by_number.get(number)
        if price_jpy is None:
            unpriced_base += len(base)
            continue
        for card_id in base:
            rows.append((card_id, "jp", SOURCE, round(price_jpy * rate, 2), "EUR", today))

    priced = len(rows)
    total_base = priced + unpriced_base
    total = total_base + unpriced_variant
    print(f"\nCartes japonaises : {total} ({total_base} tirages normaux,"
          f" {unpriced_variant} tirages alternatifs jamais tentés)")
    print(f"  cotées    : {priced} ({priced / total_base:.0%} des tirages normaux)")
    print(f"  sans prix : {unpriced_base} tirages normaux + {unpriced_variant} alternatifs")

    if args.dry_run:
        print("\n--dry-run : rien n'a été écrit.")
        return 0

    conn.execute("DELETE FROM price_history WHERE source = ? AND captured_at = ?",
                 (SOURCE, today))
    conn.executemany(
        "INSERT INTO price_history (card_id, language, source, price, currency,"
        " captured_at) VALUES (?, ?, ?, ?, ?, ?)", rows,
    )
    conn.commit()
    kept = conn.execute("SELECT COUNT(*) FROM price_history").fetchone()[0]
    conn.close()
    print(f"\n{priced} prix écrits pour le {today}. Total en base : {kept}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
