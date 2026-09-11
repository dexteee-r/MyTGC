"""Credit illustrators onto the catalogue, from a hand-picked list of artists.

Usage:
    py backend/scripts/import_artists.py            # scrape, write artists.json, load it
    py backend/scripts/import_artists.py --scrape-only
    py backend/scripts/import_artists.py --from-json  # skip the network, reload artists.json

The list of artists to track is not the whole catalogue's roster -- it is
whatever the user has personally noticed and wants to browse by (17 names as of
2026-09-12, in ARTISTS below). Adding a name there and re-running covers more;
this script never tries to discover artists on its own.

Source: onepiece.limitlesstcg.com's card search, which supports `!artist:name`
and credits every card it lists with "Illustrated by X" -- structured, reliable
markup (a `card-text-name` link and a `card-text-artist` link per card), not
prose to guess at. Checked before scraping a single page, the same as every
other source in this project: `robots.txt` is `User-agent: * / Disallow:`
(nothing withheld, no named block the way Cardmarket's names ClaudeBot), and no
terms page was found restricting reuse.

Only base printings are credited. Measured on the actual site while building
this: an alt-art print of a card shares its number with the base card but
carries its own `?v=N` marker in the site's own card link (e.g.
`/cards/OP10-108?v=2`) and, going by the image filename alongside it
(`OP10-108_p2_EN.webp`), plausibly the same `_p2`-style suffix this catalogue
already uses -- but "plausibly the same numbering" is exactly the kind of
guess the price importers next door refuse to make, having been burned by it
twice on the English side. So a `?v=` result is recorded for the coverage
report and then dropped, never written as `OPxx-xxx_p2`.

artists.json is a real, checked-in artifact (not gitignored bulk data like
backend/data/): {"OP16-025": "Nakamaru", ...}, one entry per base card number,
regenerable by re-running this script but hand-curated in the sense that the
artist list itself is a deliberate, short selection.
"""

import argparse
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

import certifi

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db
from app.config import DB_PATH

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

BASE = "https://onepiece.limitlesstcg.com"
AGENT = "MyTCG/1.0 (personal collection tracker; contact via github)"
PAUSE = 0.6

ARTISTS_JSON = Path(__file__).resolve().parent / "artists.json"

# The user's own curated list, one search slug each. Exactly what reaches
# `!artist:` in the query -- the site matches it case-insensitively, so the
# two spellings of Shie Nanahara below are the same artist, kept once.
ARTIST_SLUGS = [
    "Hayaken-sarena", "nakamaru", "ono_tako", "sowsow", "AKIRA_EGAWA",
    "Ryo_Nakama", "Yosuke_Adachi", "K_Akagishi", "Akanegumo", "Bisai",
    "Peach_Momoko", "Shie_Nanahara", "Gege_Akutami", "Norikoi",
    "Makitoshi", "Mitsuaki_Matsumoto", "Kazuno_Yuikawa",
]


# With lang=all the site prefixes the language onto the path (/cards/en/OP16-025);
# without it, it's the bare code (/cards/OP16-025). Both are matched rather than
# picking one request shape and hoping it never changes.
CODE_HREF = re.compile(r"^/cards/(?:en/|jp/)?([A-Z]+\d*-\d+)(\?.*)?$")

# This host's chain verifies fine against curl/schannel but not against
# whatever CA bundle Python's own ssl defaults picked up on this machine
# ("certificate has expired") -- pointing at certifi's own, current bundle
# fixes it without weakening verification. tcgcsv/yuyu-tei never needed this,
# so it is scoped to this script rather than touched project-wide on a guess.
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


class ArtistPageParser(HTMLParser):
    """Pulls (code, is_variant, artist) out of one search-results page.

    Two anchors, always in this order within one result block: the card's own
    name link (`<a href="/cards/CODE">` or `.../CODE?v=N`, inside
    `card-text-name`) and, further down, the credited illustrator's own link
    (inside `card-text-artist`). Nothing else on a search-results page links to
    `/cards/...`, so the first is taken as given rather than gated on a class
    check -- simpler than tracking div nesting, the same trade-off
    import_prices_jp.py's parser already makes for yuyu-tei.
    """

    def __init__(self) -> None:
        super().__init__()
        self.results: list[tuple[str, bool, str]] = []
        self._current: tuple[str, bool] | None = None
        self._awaiting_artist_link = False
        self._in_artist_link = False
        self._artist_buf: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = dict(attrs)
        if tag == "a":
            href = attr_map.get("href") or ""
            if self._current is None:
                match = CODE_HREF.match(href)
                if match:
                    self._current = (match.group(1), bool(match.group(2)))
                    return
            if self._awaiting_artist_link:
                self._in_artist_link = True
                self._artist_buf = []
            return
        if tag == "div" and "card-text-artist" in (attr_map.get("class") or "").split():
            self._awaiting_artist_link = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._in_artist_link:
            self._in_artist_link = False
            self._awaiting_artist_link = False
            artist = "".join(self._artist_buf).strip()
            if self._current and artist:
                code, is_variant = self._current
                self.results.append((code, is_variant, artist))
            self._current = None

    def handle_data(self, data: str) -> None:
        if self._in_artist_link:
            self._artist_buf.append(data)


def get_html(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=30, context=SSL_CONTEXT) as response:
        return response.read().decode("utf-8", errors="replace")


def fetch_artist(slug: str) -> list[tuple[str, bool, str]]:
    from urllib.parse import quote
    url = f"{BASE}/cards?q={quote('!artist:' + slug)}&show=all&display=full&lang=all"
    parser = ArtistPageParser()
    parser.feed(get_html(url))
    return parser.results


def merge_slug_results(
    results: list[tuple[str, bool, str]],
    slug: str,
    by_number: dict[str, str],
    conflicted: set[str],
) -> tuple[str, int, int]:
    """Folds one artist search's results into the running number -> artist map.

    Split out of `scrape` so the conflict rule itself is testable without a
    network call, the same reasoning `accumulate_plain_prices` already applies
    to the JP price importer. Mutates `by_number`/`conflicted` in place; returns
    (display name used, base count, variant count) for the caller's own print.

    Measured while building this, on real data, not assumed: a `?v=N` marker in
    the site's own link is not the only shape a distinct print takes. Several
    older common/uncommon cards get reprinted with new art in later products
    ("fa", "jr", "aa" suffixes turn up in their own price tables) without ever
    carrying `?v=` on the base search result -- ST01-011 (Brook) is credited to
    two entirely unrelated artists across this run for exactly that reason, and
    neither claim is wrong, they are both real, for different prints the search
    result cannot tell apart. Picking one would be a coin flip wearing a
    database's clothes, so a code claimed by more than one different artist in
    this list is dropped from the result entirely rather than assigned to
    whichever artist happened to be scraped first.
    """
    # One name for the whole batch, not whatever casing happened to render on
    # each individual print: the same real person turns up as both "sowsow"
    # and "SOWSOW" across two reprints of one card in this very data, which is
    # a template quirk on their side, not two different people -- using the
    # first name seen for every code this slug finds sidesteps it rather than
    # treating every casing difference as a conflict.
    display_name = next((artist for _, _, artist in results), slug)

    base_codes: set[str] = set()
    variant_codes: set[str] = set()
    for code, is_variant, _artist in results:
        if is_variant:
            variant_codes.add(code)
            continue
        base_codes.add(code)
        if code in conflicted:
            continue
        existing = by_number.get(code)
        if existing is not None and existing != display_name:
            print(f"  ! {code}: {existing!r} et {display_name!r} tous les"
                  f" deux trouvés, carte laissée sans illustrateur")
            del by_number[code]
            conflicted.add(code)
            continue
        by_number[code] = display_name
    return display_name, len(base_codes), len(variant_codes)


def scrape() -> dict[str, str]:
    """Base card number -> artist, across every slug in ARTIST_SLUGS."""
    by_number: dict[str, str] = {}
    conflicted: set[str] = set()
    for index, slug in enumerate(ARTIST_SLUGS, 1):
        try:
            results = fetch_artist(slug)
        except (urllib.error.URLError, TimeoutError) as caught:
            print(f"  ! {slug}: {caught}")
            continue
        time.sleep(PAUSE)

        display_name, base, variants = merge_slug_results(
            results, slug, by_number, conflicted,
        )
        print(f"  {index}/{len(ARTIST_SLUGS)} {display_name}:"
              f" {base} tirages de base, {variants} tirages alternatifs ignorés")
    if conflicted:
        print(f"\n{len(conflicted)} numéros laissés sans illustrateur"
              f" (plusieurs artistes trouvés pour le même code) : "
              f"{', '.join(sorted(conflicted))}")
    return by_number


def apply_to_db(by_number: dict[str, str]) -> tuple[int, int]:
    """Writes artist onto every base printing (no '_' in id) whose number
    matches -- both languages, the same illustrator credit either way. Returns
    (rows updated, numbers with no match in this catalogue)."""
    conn = db.connect()
    db.init_schema(conn)

    updated = 0
    unmatched = 0
    for number, artist in by_number.items():
        cursor = conn.execute(
            "UPDATE cards SET artist = ? WHERE id = ? AND instr(id, '_') = 0",
            (artist, number),
        )
        if cursor.rowcount:
            updated += cursor.rowcount
        else:
            unmatched += 1
    conn.commit()
    conn.close()
    return updated, unmatched


def main() -> int:
    parser = argparse.ArgumentParser(description="Credit illustrators onto the catalogue.")
    parser.add_argument("--scrape-only", action="store_true",
                         help="write artists.json, skip the database")
    parser.add_argument("--from-json", action="store_true",
                         help="reload artists.json into the database without scraping")
    args = parser.parse_args()

    if args.from_json:
        by_number = json.loads(ARTISTS_JSON.read_text(encoding="utf-8"))
        print(f"{len(by_number)} numéros lus depuis {ARTISTS_JSON.name}")
    else:
        by_number = scrape()
        if not by_number:
            print("Aucun artiste n'a renvoyé de carte. Rien n'a été écrit.", file=sys.stderr)
            return 1
        ARTISTS_JSON.write_text(
            json.dumps(by_number, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(f"\n{len(by_number)} numéros écrits dans {ARTISTS_JSON.name}")

    if args.scrape_only:
        return 0

    updated, unmatched = apply_to_db(by_number)
    print(f"{updated} lignes mises à jour en base"
          f" ({unmatched} numéros absents de ce catalogue).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
