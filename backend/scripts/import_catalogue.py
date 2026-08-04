"""Import the punk-records catalogue (EN + JP) into SQLite.

Covers build steps 1 and 2 of PROJECT_CONTEXT.md: load the catalogue, then audit the
data quality of the Japanese locale and backfill from English where it is deficient.

Usage:
    py backend/scripts/import_catalogue.py [--fresh]

Assumes punk-records has been cloned to backend/data/punk-records:
    git clone --depth 1 https://github.com/buhbbl/punk-records.git backend/data/punk-records
"""

import argparse
import html
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db
from app.config import DB_PATH, LANGUAGES, PUNK_RECORDS_DIR

# The report prints Japanese pack names. A Windows console defaults to cp1252 and
# raises UnicodeEncodeError on them, so force UTF-8 rather than relying on the
# caller to set PYTHONIOENCODING.
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

# Enum values PROJECT_CONTEXT.md section 4 declares. Anything outside these is
# reported rather than silently accepted, so a new set introducing a new rarity
# surfaces at import time instead of breaking a filter in the UI.
EXPECTED_RARITIES = {
    "Common", "Uncommon", "Rare", "SuperRare", "SecretRare",
    "Leader", "Special", "TreasureRare", "Promo",
}
EXPECTED_CATEGORIES = {"Leader", "Character", "Event", "Stage", "Don"}

TEXT_FIELDS = ("name", "effect", "trigger")
LIST_FIELDS = ("colors", "attributes", "types")

# Gameplay stats that must agree between the EN and JP printing of the same card
# number. Used as a consistency check, not to overwrite anything.
SHARED_FIELDS = ("cost", "power", "counter", "category", "colors")

# The set code printed on the pack, e.g. "[ST-01]" in English and "【ST-01】" in
# Japanese. vegapull only looks for ASCII brackets, so every Japanese pack comes
# through with title_parts.label == null; matching both widths repairs it.
PACK_CODE_RE = re.compile(r"[\[【]\s*([A-Z0-9]{2,4}-[A-Z0-9]{2,4})\s*[\]】]")

# Line breaks in effect and trigger text arrive as literal HTML tags.
BREAK_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)


# --------------------------------------------------------------------------- load


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_packs(lang_dir: Path) -> dict[str, dict[str, str | None]]:
    """pack_id -> {code, name}.

    punk-records keys packs by an opaque numeric id; the printed set code and the
    human title are meant to live in `title_parts`. That parsing is unreliable, so
    the code is re-extracted from `raw_title` and only falls back to `title_parts`.

    A handful of packs are catch-alls with no printed code at all ("Promotion card",
    "限定商品収録カード"); their code stays None.
    """
    packs = {}
    for pack_id, pack in read_json(lang_dir / "packs.json").items():
        parts = pack.get("title_parts") or {}
        raw_title = html.unescape(pack.get("raw_title") or "")

        match = PACK_CODE_RE.search(raw_title)
        code = match.group(1) if match else parts.get("label")

        if parts.get("label"):
            # title_parts parsed correctly, its title is already stripped.
            name = html.unescape(parts.get("title") or raw_title)
        else:
            # Rebuild a clean name by removing the bracketed code from the raw title.
            name = PACK_CODE_RE.sub("", raw_title).strip(" -–—:・")

        packs[pack_id] = {"code": code, "name": name or raw_title}
    return packs


def normalise(card: dict) -> dict:
    """Strip the HTML that leaks out of the scrape.

    punk-records reads the official card list, which serves `&amp;` inside card names
    ('Shachi &amp; Penguin') and `<br>` inside effect text. Both are markup, not
    content, so they are resolved once at import rather than in every consumer.
    """
    out = dict(card)
    for field in TEXT_FIELDS:
        if isinstance(out.get(field), str):
            out[field] = html.unescape(BREAK_RE.sub("\n", out[field])).strip()
    for field in LIST_FIELDS:
        if isinstance(out.get(field), list):
            out[field] = [html.unescape(v) if isinstance(v, str) else v for v in out[field]]
    return out


def load_cards(lang_dir: Path) -> tuple[dict[str, dict], list[tuple[str, str, str]]]:
    """Load every pack file. Returns (cards keyed by id, list of duplicate collisions).

    A card can be listed under two packs (a promo reprinted in a collection box).
    The rows are identical apart from pack_id, so the lowest pack_id wins and the
    collision is reported.
    """
    cards: dict[str, dict] = {}
    collisions: list[tuple[str, str, str]] = []

    for pack_file in sorted((lang_dir / "data").glob("*.json")):
        for raw in read_json(pack_file):
            card = normalise(raw)
            card_id = card["id"]
            existing = cards.get(card_id)
            if existing is None:
                cards[card_id] = card
            else:
                collisions.append((card_id, existing["pack_id"], card["pack_id"]))
    return cards, collisions


def punk_records_commit() -> str | None:
    try:
        return subprocess.run(
            ["git", "-C", str(PUNK_RECORDS_DIR), "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


# -------------------------------------------------------------------------- audit


def audit(lang: str, cards: dict[str, dict], collisions: list) -> dict:
    """Data-quality report for one language. Never mutates; only measures."""
    values = list(cards.values())
    by_category = Counter(c.get("category") for c in values)

    missing = {field: [c["id"] for c in values if not c.get(field)] for field in LIST_FIELDS}
    missing["name"] = [c["id"] for c in values if not c.get("name")]
    missing["rarity"] = [c["id"] for c in values if not c.get("rarity")]
    missing["category"] = [c["id"] for c in values if not c.get("category")]
    missing["img_full_url"] = [c["id"] for c in values if not c.get("img_full_url")]

    # `counter` is legitimately null for Leaders, Events, Stages and for Characters
    # printed without a counter value, so it is reported per category rather than
    # treated as an error outright.
    null_counter = defaultdict(int)
    for c in values:
        if c.get("counter") is None:
            null_counter[c.get("category")] += 1

    return {
        "language": lang,
        "total": len(values),
        "alt_arts": sum(1 for c in values if "_p" in c["id"]),
        "packs": len({c["pack_id"] for c in values}),
        "collisions": collisions,
        "categories": dict(by_category),
        "missing": missing,
        "null_counter_by_category": dict(null_counter),
        "unexpected_rarities": sorted(
            {c.get("rarity") for c in values} - EXPECTED_RARITIES - {None}
        ),
        "unexpected_categories": sorted(
            {c.get("category") for c in values} - EXPECTED_CATEGORIES - {None}
        ),
    }


def backfill_from_english(jp: dict[str, dict], en: dict[str, dict]) -> dict:
    """PROJECT_CONTEXT.md step 2: vegapull is known to drop `colors` on the Japanese
    locale. EN and JP share card numbering, so the English row is authoritative where
    the Japanese one is empty.

    Only `colors` is backfilled. A null `counter` is NOT treated as a defect: it is a
    valid value for Leaders, Events, Stages and for Characters printed without one,
    and the null rate is the same on both locales, so there is no evidence of a
    Japanese-specific problem to repair.

    Guarded rather than unconditional: if a future punk-records regeneration
    reintroduces the defect this catches it; on clean data it reports zero and
    changes nothing.
    """
    filled, unrecoverable = [], []

    for card_id, card in jp.items():
        if card.get("colors"):
            continue
        source = en.get(card_id)
        if source and source.get("colors"):
            card["colors"] = list(source["colors"])
            filled.append(card_id)
        else:
            unrecoverable.append(card_id)

    return {"colors_filled": filled, "colors_unrecoverable": unrecoverable}


def cross_language_check(en: dict[str, dict], jp: dict[str, dict]) -> dict:
    """Compare the two locales on fields that describe the physical card.

    A disagreement means one of the two scrapes is wrong, which matters well beyond
    display: build step 2 assumes shared numbering, and a mismatched row would make
    an EN-sourced backfill inject wrong data into the JP catalogue.
    """
    shared = set(en) & set(jp)
    disagreements = defaultdict(list)
    for card_id in shared:
        for field in SHARED_FIELDS:
            a, b = en[card_id].get(field) or None, jp[card_id].get(field) or None
            if isinstance(a, list) or isinstance(b, list):
                a, b = set(a or []), set(b or [])
            if a != b:
                disagreements[field].append(card_id)
    return {
        "shared": len(shared),
        "en_only": len(set(en) - shared),
        "jp_only": len(set(jp) - shared),
        "disagreements": {k: sorted(v) for k, v in disagreements.items()},
    }


# ------------------------------------------------------------------------- insert


def to_row(card: dict, lang: str, packs: dict[str, dict]) -> tuple:
    pack = packs.get(card["pack_id"], {})
    return (
        card["id"],
        lang,
        card["name"],
        card["pack_id"],
        pack.get("code"),
        pack.get("name"),
        card.get("rarity"),
        card.get("category"),
        json.dumps(card.get("colors") or [], ensure_ascii=False),
        card.get("cost"),
        card.get("power"),
        card.get("counter"),
        json.dumps(card.get("attributes") or [], ensure_ascii=False),
        json.dumps(card.get("types") or [], ensure_ascii=False),
        card.get("effect"),
        card.get("trigger"),
        card.get("img_full_url"),
    )


INSERT_SQL = """
INSERT INTO cards (
    id, language, name, pack_id, pack_code, pack_name, rarity, category,
    colors, cost, power, counter, attributes, types, effect, trigger, img_url
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (id, language) DO UPDATE SET
    name       = excluded.name,
    pack_id    = excluded.pack_id,
    pack_code  = excluded.pack_code,
    pack_name  = excluded.pack_name,
    rarity     = excluded.rarity,
    category   = excluded.category,
    colors     = excluded.colors,
    cost       = excluded.cost,
    power      = excluded.power,
    counter    = excluded.counter,
    attributes = excluded.attributes,
    types      = excluded.types,
    effect     = excluded.effect,
    trigger    = excluded.trigger,
    img_url    = excluded.img_url
"""
# image_path and the three phash columns are deliberately absent from the UPDATE:
# re-running the import must not discard the work of build step 3.


# ------------------------------------------------------------------------- report


def print_audit(report: dict) -> None:
    lang = report["language"].upper()
    print(f"\n  [{lang}] {report['total']} cards across {report['packs']} packs "
          f"({report['alt_arts']} alt arts)")

    for field, ids in sorted(report["missing"].items()):
        if ids:
            print(f"    ! missing {field}: {len(ids)} -> {ids[:5]}")

    if report["collisions"]:
        print(f"    ! {len(report['collisions'])} id(s) listed in two packs, "
              f"lowest pack_id kept:")
        for card_id, kept, dropped in report["collisions"]:
            print(f"        {card_id}: kept {kept}, dropped {dropped}")

    if report["unexpected_rarities"]:
        print(f"    ! rarities outside the documented enum: {report['unexpected_rarities']}")
    if report["unexpected_categories"]:
        print(f"    ! categories outside the documented enum: {report['unexpected_categories']}")

    nulls = report["null_counter_by_category"]
    total_null = sum(nulls.values())
    detail = ", ".join(f"{k}={v}" for k, v in sorted(nulls.items(), key=lambda kv: -kv[1]))
    print(f"    counter null: {total_null}/{report['total']} ({detail})")


# --------------------------------------------------------------------------- main


def main() -> int:
    parser = argparse.ArgumentParser(description="Import punk-records into SQLite.")
    parser.add_argument("--fresh", action="store_true",
                        help="drop the cards table first (discards cached phashes)")
    args = parser.parse_args()

    if not PUNK_RECORDS_DIR.exists():
        print(f"punk-records not found at {PUNK_RECORDS_DIR}\n"
              f"  git clone --depth 1 https://github.com/buhbbl/punk-records.git "
              f"{PUNK_RECORDS_DIR}", file=sys.stderr)
        return 1

    commit = punk_records_commit()
    print(f"Source: punk-records @ {commit or 'unknown commit'}")

    loaded, audits, manifests, packs_by_lang = {}, {}, {}, {}
    for lang, folder in LANGUAGES.items():
        lang_dir = PUNK_RECORDS_DIR / folder
        cards, collisions = load_cards(lang_dir)
        loaded[lang] = cards
        packs_by_lang[lang] = load_packs(lang_dir)
        audits[lang] = audit(lang, cards, collisions)
        manifests[lang] = read_json(lang_dir / "manifest.json")

    print("\n=== Step 2 — data quality audit (pre-backfill) ===")
    for lang in LANGUAGES:
        print_audit(audits[lang])
        packs = packs_by_lang[lang]
        unlabelled = [p["name"] for p in packs.values() if not p["code"]]
        print(f"    pack codes resolved: {len(packs) - len(unlabelled)}/{len(packs)}"
              + (f"  (no printed code: {unlabelled})" if unlabelled else ""))

    print("\n=== Step 2 — cross-language consistency ===")
    cross = cross_language_check(loaded["en"], loaded["jp"])
    print(f"  {cross['shared']} shared ids, {cross['jp_only']} JP-only, "
          f"{cross['en_only']} EN-only")
    if cross["disagreements"]:
        for field, ids in sorted(cross["disagreements"].items()):
            print(f"    ! {field}: {len(ids)} shared id(s) disagree -> {ids[:5]}")
    else:
        print("  the two locales agree on every shared card.")

    print("\n=== Step 2 — backfill JP from EN ===")
    fixes = backfill_from_english(loaded["jp"], loaded["en"])
    print(f"  colors backfilled: {len(fixes['colors_filled'])} {fixes['colors_filled'][:5]}")
    if fixes["colors_unrecoverable"]:
        print(f"  ! colors still empty (no EN counterpart): "
              f"{len(fixes['colors_unrecoverable'])} {fixes['colors_unrecoverable'][:5]}")
    if not fixes["colors_filled"] and not fixes["colors_unrecoverable"]:
        print("  nothing to fix: JP colors are complete in this snapshot.")

    print("\n=== Step 1 — import ===")
    conn = db.connect()
    db.init_schema(conn)
    if args.fresh:
        conn.execute("DELETE FROM cards")
        conn.execute("DELETE FROM catalogue_meta")
        print("  --fresh: cards table emptied")

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for lang, folder in LANGUAGES.items():
        packs = packs_by_lang[lang]
        rows = [to_row(c, lang, packs) for c in loaded[lang].values()]
        conn.executemany(INSERT_SQL, rows)

        generated = manifests[lang].get("generated_at")
        generated_iso = (
            datetime.fromtimestamp(generated, timezone.utc).isoformat(timespec="seconds")
            if isinstance(generated, (int, float)) else None
        )
        conn.execute(
            "INSERT INTO catalogue_meta (language, source, source_commit, generated_at,"
            " card_count, imported_at) VALUES (?, ?, ?, ?, ?, ?)"
            " ON CONFLICT (language) DO UPDATE SET source_commit = excluded.source_commit,"
            " generated_at = excluded.generated_at, card_count = excluded.card_count,"
            " imported_at = excluded.imported_at",
            (lang, "punk-records", commit, generated_iso, len(rows), now),
        )
        print(f"  {lang}: {len(rows)} rows upserted (snapshot generated {generated_iso})")

    conn.commit()

    total = conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
    print(f"\nDatabase: {DB_PATH}")
    print(f"Total rows in cards: {total}")
    print("\nNext: build step 3 — download images and precompute R/G/B pHashes.")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
