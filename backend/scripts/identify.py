"""Identify a card from an image, offline. Build step 4's CLI.

Expects an image already framed on the card — the whole card, edges roughly at the
image border. Detection and deskew from a wider photo is a separate stage, added when
there are real photographs to test it against.

Usage:
    py backend/scripts/identify.py photo.jpg [--language en] [--top 5]
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db, hashing, recognition
from app.config import LANGUAGES

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")


def main() -> int:
    parser = argparse.ArgumentParser(description="Identify a card from an image.")
    parser.add_argument("image", type=Path, nargs="+")
    parser.add_argument("--language", choices=sorted(LANGUAGES),
                        help="restrict to one locale (default: search both)")
    parser.add_argument("--top", type=int, default=5)
    parser.add_argument("--max-distance", type=int,
                        default=recognition.DEFAULT_MAX_DISTANCE)
    args = parser.parse_args()

    conn = db.connect()
    catalogue = recognition.Catalogue(conn, args.language)
    print(f"Catalogue: {len(catalogue)} printings"
          f"{' (' + args.language + ')' if args.language else ''}\n")

    exit_code = 0
    for path in args.image:
        if not path.exists():
            print(f"{path}: not found", file=sys.stderr)
            exit_code = 1
            continue

        image = hashing.load_card_image(path, region="art")
        result = catalogue.identify(
            hashing.phash_rgb(image), top=args.top, max_distance=args.max_distance
        )
        report(path, result)

    conn.close()
    return exit_code


def report(path: Path, result: recognition.Result) -> None:
    print(f"=== {path.name} ===")
    if not result.candidates:
        print("  no match within the distance limit — fall back to manual search\n")
        return

    best = result.best
    verdict = "confident" if result.confident else "AMBIGUOUS"
    margin = "n/a" if result.margin is None else f"{result.margin} bits"
    print(f"  {verdict}: {best.card_number} [{best.language}] {best.name}")
    print(f"  distance {best.distance}/192, margin to next card number {margin}")

    if best.ambiguous_printing:
        tied = [p.card_id for p in best.printings if p.distance == best.distance]
        print(f"  {len(tied)} printings tie at this distance — identical artwork, "
              f"identical printed code:")
        for printing in best.printings:
            if printing.distance == best.distance:
                print(f"      {printing.card_id:<16} {printing.pack_code or '-':<10}"
                      f" {printing.rarity or '-'}")
        print("      pHash cannot separate these; OCR cannot either. Ask the user.")

    if len(result.candidates) > 1:
        print("  other candidates:")
        for candidate in result.candidates[1:]:
            print(f"      {candidate.distance:>3}  {candidate.card_number:<12}"
                  f" [{candidate.language}] {candidate.name[:34]}")
    print()


if __name__ == "__main__":
    raise SystemExit(main())
