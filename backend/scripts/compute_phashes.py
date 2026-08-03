"""Compute the R/G/B perceptual hashes for every cached card image.

Build step 3, second half. Runs entirely off the local image cache, so it is cheap to
re-run with a different crop — which is exactly what the step-5 calibration needs.

Usage:
    py backend/scripts/compute_phashes.py [--region art|full] [--language en|jp] [--all]

By default only cards missing a hash are processed; --all recomputes everything, which
is what you want after changing the region.
"""

import argparse
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db, hashing
from app.config import DATA_DIR, LANGUAGES

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")


def main() -> int:
    parser = argparse.ArgumentParser(description="Precompute R/G/B pHashes.")
    parser.add_argument("--region", choices=("art", "full"), default="art",
                        help="'art' crops to the watermark-free illustration band "
                             "(default); 'full' hashes the whole card")
    parser.add_argument("--language", choices=sorted(LANGUAGES))
    parser.add_argument("--all", action="store_true",
                        help="recompute even where a hash already exists")
    args = parser.parse_args()

    conn = db.connect()

    query = ("SELECT id, language, image_path FROM cards "
             "WHERE image_path IS NOT NULL")
    params: list = []
    if args.language:
        query += " AND language = ?"
        params.append(args.language)
    if not args.all:
        query += " AND r_phash IS NULL"
    rows = conn.execute(query + " ORDER BY language, id", params).fetchall()

    total = conn.execute("SELECT COUNT(*) FROM cards WHERE image_path IS NOT NULL").fetchone()[0]
    print(f"Region: {args.region}"
          + (f"  crop {hashing.ART_BOX}" if args.region == "art" else ""))
    print(f"{total} cards with a cached image | {len(rows)} to hash")
    if not rows:
        print("Nothing to do.")
        return 0

    updates, failures = [], []
    for i, row in enumerate(rows, 1):
        try:
            img = hashing.load_card_image(DATA_DIR / row["image_path"], args.region)
            r, g, b = hashing.phash_rgb(img)
        except Exception as exc:                              # noqa: BLE001
            failures.append((row["id"], row["language"], f"{type(exc).__name__}: {exc}"))
            continue
        updates.append((
            hashing.to_signed(r), hashing.to_signed(g), hashing.to_signed(b),
            row["id"], row["language"],
        ))
        if i % 1000 == 0 or i == len(rows):
            print(f"  {i}/{len(rows)}")

    conn.executemany(
        "UPDATE cards SET r_phash = ?, g_phash = ?, b_phash = ?"
        " WHERE id = ? AND language = ?",
        updates,
    )
    conn.commit()
    print(f"\nHashed {len(updates)}, failed {len(failures)}")
    for card_id, lang, error in failures[:10]:
        print(f"  {lang} {card_id}: {error}")

    report_collisions(conn)
    conn.close()
    return 1 if failures else 0


def report_collisions(conn) -> None:
    """Cards sharing an identical hash triple cannot be told apart by pHash alone.

    Within one language this is the headline risk for the step-5 gate. Across
    languages it is expected and harmless: the EN and JP printings of a card share
    the artwork, and they are separate rows keyed by (id, language).
    """
    print("\n=== Hash collisions ===")
    for lang in sorted(LANGUAGES):
        groups = defaultdict(list)
        for row in conn.execute(
            "SELECT id, r_phash, g_phash, b_phash FROM cards"
            " WHERE language = ? AND r_phash IS NOT NULL", (lang,)
        ):
            groups[(row["r_phash"], row["g_phash"], row["b_phash"])].append(row["id"])

        clashes = {k: v for k, v in groups.items() if len(v) > 1}
        affected = sum(len(v) for v in clashes.values())
        print(f"  [{lang}] {len(groups)} distinct hashes | "
              f"{len(clashes)} collision groups covering {affected} cards")
        for ids in list(clashes.values())[:8]:
            print(f"      {ids[:6]}{' ...' if len(ids) > 6 else ''}")


if __name__ == "__main__":
    raise SystemExit(main())
