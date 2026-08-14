"""Snapshot card prices into price_history, in euros.

Usage:
    py backend/scripts/import_prices.py [--dry-run]

Why this source and not the one that was asked for:

Cardmarket is the market a European collector actually buys on, and its API is the
one this app should have used. It is closed -- help.cardmarket.com states plainly
"we are not accepting applications for access to the Cardmarket API", so this is not
a matter of qualifying for it. TCGplayer stopped taking new API applications in late
2024. Both doors are shut, and neither is reopening on a schedule anyone publishes.

So prices come from tcgcsv.com, which mirrors TCGplayer's own catalogue and price
data into flat JSON daily, needs no key, and covers One Piece (category 68). That
means the figures are the *American* market. They are converted to euros at the day's
ECB reference rate so they sit beside the hand-entered purchase prices without a unit
change, but a converted US price is not a Cardmarket price, and the UI says so rather
than presenting the total as what the collection would fetch locally.

Only the English catalogue is priced: TCGplayer sells the English printing, and there
is no equivalent free feed for the Japanese one. Japanese cards get no row, which is
why the app reports how many cards carry a price rather than only a total.
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

TCGCSV = "https://tcgcsv.com/tcgplayer"
ONE_PIECE = 68

# tcgcsv asks for an identifiable agent and a quarter-second between calls. It is a
# free mirror run by one person; the whole catalogue is ~170 requests either way.
AGENT = "MyTCG/1.0 (personal collection tracker; contact via github)"
PAUSE = 0.25

# European Central Bank reference rates, no key. The rate is fetched once and stamped
# on every row of the run, so a snapshot is internally consistent even if the run
# straddles midnight.
FX = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR"

SOURCE = "tcgcsv/tcgplayer"

# 'Shanks (028)' is the plain printing; the parenthetical is the collector number.
# 'Shanks (028) (Alternate Art)' is a parallel. Stripping the number first is what
# separates the two, and the "- OP09-004" form appears on cards a set reprints.
NUMBER_PAREN = re.compile(r"\(\d{2,4}\)")
INLINE_CODE = re.compile(r"-\s*[A-Z]{2,4}\d{2}-\d{2,3}")


def get(url: str):
    request = urllib.request.Request(url, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def is_plain(product_name: str) -> bool:
    """True for the ordinary printing, False for a parallel or an alternate art."""
    cleaned = INLINE_CODE.sub("", NUMBER_PAREN.sub("", product_name))
    return "(" not in cleaned


def usd_to_eur() -> float:
    rate = get(FX)["rates"]["EUR"]
    if not 0.5 < rate < 1.5:
        raise SystemExit(f"refusing an implausible USD->EUR rate: {rate}")
    return rate


def key(code: str) -> str:
    """'OP-01', 'OP01', 'ST-31' -> 'OP01', 'OP01', 'ST31'."""
    return re.sub(r"[^A-Z0-9]", "", (code or "").upper())


def collect() -> dict[str, list[tuple[str, float]]]:
    """card number -> [(product name, USD market price)], plain printing first.

    A number is only taken from the set that printed it. The same number turns up in
    several tcgcsv groups -- a promo box reprinting an OP-01 card keeps the OP-01
    number -- and pooling those made an alternate art inherit a reprint's price.

    Matching the number's prefix against the group's abbreviation is the obvious rule
    and it does not survive contact with the data: the English releases that merged
    two products are abbreviated 'OP15-EB04' and 'EB-03-04' while the numbers inside
    them read OP15-xxx and EB04-xxx. So the home of a numbering series is taken to be
    the group holding the most of it, which is true of a real set and never of a promo
    box borrowing a handful of numbers.
    """
    groups = get(f"{TCGCSV}/{ONE_PIECE}/groups")["results"]
    print(f"{len(groups)} extensions chez tcgcsv")

    # (group id, number) -> entries, kept apart until the home group is known.
    staged: dict[tuple[int, str], list[tuple[str, float]]] = defaultdict(list)
    series: dict[str, dict[int, set[str]]] = defaultdict(lambda: defaultdict(set))

    for index, group in enumerate(groups, 1):
        gid = group["groupId"]
        try:
            products = get(f"{TCGCSV}/{ONE_PIECE}/{gid}/products")["results"]
            time.sleep(PAUSE)
            prices = get(f"{TCGCSV}/{ONE_PIECE}/{gid}/prices")["results"]
            time.sleep(PAUSE)
        except (urllib.error.URLError, KeyError) as caught:
            print(f"  ! {group.get('abbreviation') or gid}: {caught}")
            continue

        # One row per product, so the first non-null market price wins outright.
        market = {}
        for row in prices:
            if row.get("marketPrice") is not None:
                market.setdefault(row["productId"], row["marketPrice"])

        for product in products:
            number = next((d["value"] for d in product.get("extendedData", [])
                           if d["name"] == "Number"), None)
            price = market.get(product["productId"])
            if not number or price is None or "-" not in number:
                continue
            staged[(gid, number)].append((product["name"], price))
            series[key(number.split("-")[0])][gid].add(number)

        if index % 20 == 0:
            print(f"  {index}/{len(groups)} extensions lues")

    home = {prefix: max(holders, key=lambda g: len(holders[g]))
            for prefix, holders in series.items()}

    by_number: dict[str, list[tuple[str, float]]] = {}
    for (gid, number), entries in staged.items():
        if home.get(key(number.split("-")[0])) != gid:
            continue
        by_number[number] = sorted(entries, key=lambda e: (not is_plain(e[0]), e[0]))
    return by_number


def main() -> int:
    parser = argparse.ArgumentParser(description="Snapshot prices into price_history.")
    parser.add_argument("--dry-run", action="store_true",
                        help="report coverage without writing anything")
    args = parser.parse_args()

    rate = usd_to_eur()
    print(f"Taux BCE du jour : 1 USD = {rate} EUR")

    by_number = collect()
    print(f"{len(by_number)} numéros de carte cotés")

    conn = db.connect()
    db.init_schema(conn)

    ours: dict[str, list[str]] = defaultdict(list)
    for row in conn.execute("SELECT id FROM cards WHERE language = 'en'"):
        ours[row["id"].split("_")[0]].append(row["id"])
    for ids in ours.values():
        ids.sort(key=lambda i: ("_" in i, i))

    today = date.today().isoformat()
    rows, unpriced, ambiguous = [], 0, 0

    # The plain printing is unambiguous: one number, one ordinary card, and it is what
    # a collection holds most of. The parallels are not. punk-records numbers them
    # _p1/_p2/_r1 in its own order and tcgcsv names them "(Parallel)", "(Manga Art)",
    # "(Alternate Art)" in another, and nothing in either source ties the two together.
    # They are paired by position only when both sides agree on how many exist, which
    # is the one case where the order cannot silently shift. Otherwise they go
    # unpriced: an alternate art runs thirty times the plain card, so a confident wrong
    # figure would poison the total far worse than a visible gap.
    for number, ids in ours.items():
        entries = by_number.get(number, [])
        plain = [e for e in entries if is_plain(e[0])]
        parallel = [e for e in entries if not is_plain(e[0])]
        base = [i for i in ids if "_" not in i]
        variants = [i for i in ids if "_" in i]

        for card_id, entry in zip(base, plain):
            rows.append((card_id, "en", SOURCE, round(entry[1] * rate, 2), "EUR", today))
        unpriced += max(0, len(base) - len(plain))

        if variants and len(variants) == len(parallel):
            for card_id, entry in zip(variants, parallel):
                rows.append((card_id, "en", SOURCE,
                             round(entry[1] * rate, 2), "EUR", today))
        else:
            unpriced += len(variants)
            ambiguous += len(variants) if parallel else 0

    priced = len(rows)
    total = priced + unpriced
    print(f"\nCartes anglaises : {total}")
    print(f"  cotées    : {priced} ({priced / total:.0%})")
    print(f"  sans prix : {unpriced}")
    print(f"    dont tirages alternatifs trop ambigus pour être appariés : {ambiguous}")

    if args.dry_run:
        print("\n--dry-run : rien n'a été écrit.")
        return 0

    # One snapshot per card per day: re-running the script the same day corrects that
    # day's figure instead of stacking a second reading on top of it.
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
