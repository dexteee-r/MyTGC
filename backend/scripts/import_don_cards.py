"""Import DON!! cards from optcgapi.com.

punk-records (and the vegapull scrape it wraps) does not list DON!! cards at all --
PROJECT_CONTEXT.md section 4 already anticipated a `Don` category with no data behind
it. optcgapi.com is a free, keyless community API with a dedicated endpoint that does
cover them: ~142 special/alt-art DON!! cards, English only -- no equivalent Japanese
source was found, the same shape of gap prices already have there.

Each entry carries no structured set reference; the set is embedded at the end of the
card's own name ("... - The Azure Sea's Seven (OP14)"). Cross-referenced against the
`cards` table already imported by import_catalogue.py to inherit the real pack_id,
pack_name and release_date -- so a DON!! card lands in the same extension as the set
it shipped with, rather than a generic bucket. Run import_catalogue.py first.

Usage:
    py backend/scripts/import_don_cards.py
"""

import re
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db
from app.config import DB_PATH

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

API_URL = "https://optcgapi.com/api/allDonCards/"
USER_AGENT = "MyTCG/0.1 (personal collection manager; +https://github.com/dexteee-r/MyTCG)"

# "... (OP14)" / "... (ST-01)" at the end of the name -- optcgapi omits the hyphen
# punk-records' own pack_code carries, so it is reinserted before the lookup below.
SET_SUFFIX_RE = re.compile(r"\(([A-Z]+)-?(\d+)\)\s*$")

FALLBACK_PACK_ID = "DON"

# app/release_dates.py already documents this: Japan sold OP-14, OP-15 and EB-04 as
# three separate products, but the English market bundled them into two, so
# punk-records' own English pack_code for these is "OP14-EB04" / "OP15-EB04" --
# there is no plain "OP-14" to find. optcgapi's card names use the simple product
# name regardless, so the two known compound codes are remapped by hand rather than
# silently falling five real cards through to the generic bucket.
KNOWN_COMPOUND_CODES = {"OP-14": "OP14-EB04", "OP-15": "OP15-EB04"}


def normalise_pack_code(name: str) -> str | None:
    match = SET_SUFFIX_RE.search(name)
    if not match:
        return None
    letters, digits = match.groups()
    code = f"{letters}-{digits}"
    return KNOWN_COMPOUND_CODES.get(code, code)


def resolve_pack(conn, pack_code: str | None) -> tuple[str, str | None, str | None, str | None]:
    """(pack_id, pack_code, pack_name, release_date) for a DON card's own row.

    Falls back to a shared synthetic pack, the same treatment punk-records itself
    gives a Promo with no printed code -- not dropped, just not attributed to a real
    extension nobody can otherwise identify it with.
    """
    if pack_code:
        row = conn.execute(
            "SELECT pack_id, pack_code, pack_name, release_date FROM cards"
            " WHERE pack_code = ? AND language = 'en' LIMIT 1",
            (pack_code,),
        ).fetchone()
        if row:
            return row["pack_id"], row["pack_code"], row["pack_name"], row["release_date"]
    return FALLBACK_PACK_ID, None, "DON!! Card", None


INSERT_SQL = """
INSERT INTO cards (
    id, language, name, pack_id, pack_code, pack_name, rarity, category,
    colors, cost, power, counter, attributes, types, effect, trigger, img_url,
    release_date
) VALUES (?, 'en', ?, ?, ?, ?, ?, 'Don', '[]', NULL, NULL, NULL, '[]', '[]', ?, NULL, ?, ?)
ON CONFLICT (id, language) DO UPDATE SET
    name         = excluded.name,
    pack_id      = excluded.pack_id,
    pack_code    = excluded.pack_code,
    pack_name    = excluded.pack_name,
    rarity       = excluded.rarity,
    effect       = excluded.effect,
    img_url      = excluded.img_url,
    release_date = excluded.release_date
"""
# image_path and the three phash columns are deliberately absent from the UPDATE,
# same reasoning as import_catalogue.py: re-running this must not discard build
# step 3's work.


def main() -> int:
    print(f"Source: {API_URL}")
    response = requests.get(API_URL, headers={"User-Agent": USER_AGENT}, timeout=30)
    response.raise_for_status()
    entries = response.json()
    print(f"  {len(entries)} DON!! cards received")

    conn = db.connect()
    db.init_schema(conn)

    matched, unmatched, rows = 0, 0, []
    for entry in entries:
        # Not `f"DON-{entry['card_image_id']}"` (e.g. "DON-don_7"): /cards/{id} treats
        # everything after the first underscore in an id as a printing-variant suffix
        # of everything before it (OP01-001 / OP01-001_p1), grouping by
        # `id.split("_")[0]`. That underscore would have collapsed all ~180 of these
        # into "siblings" of one another. No underscore anywhere in the id avoids it.
        number = entry["card_image_id"].removeprefix("don_")
        card_id = f"DON-{int(number):03d}"
        pack_code = normalise_pack_code(entry["optcg_don_name"])
        pack_id, resolved_code, pack_name, release_date = resolve_pack(conn, pack_code)
        if resolved_code:
            matched += 1
        else:
            unmatched += 1
        rows.append((
            card_id, entry["card_name"], pack_id, resolved_code, pack_name,
            entry.get("rarity") or "DON!!", entry.get("card_text"),
            entry.get("card_image"), release_date,
        ))

    conn.executemany(INSERT_SQL, rows)
    conn.commit()

    print(f"  matched to a real extension: {matched}")
    print(f"  fell back to the generic '{FALLBACK_PACK_ID}' bucket: {unmatched}")

    total = conn.execute("SELECT COUNT(*) FROM cards WHERE category = 'Don'").fetchone()[0]
    print(f"\nDatabase: {DB_PATH}")
    print(f"Total DON!! rows: {total}")
    print("\nNext: py backend/scripts/download_images.py, then compute_phashes.py --all")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
