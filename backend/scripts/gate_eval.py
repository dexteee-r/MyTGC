"""Build step 5 — the recognition gate, measured on real photographs.

PROJECT_CONTEXT.md section 7 makes this a go/no-go, not a checkbox: if the rate is
inadequate, the pipeline gets revised rather than the product getting built on top of
it. Everything measured before this point used the official renders or synthetic
degradation, so the one thing still unknown is how far printed ink, gloss and foil
drift from the reference images.

Photographs go in backend/data/photos/ (gitignored — card art is third-party
copyright). Ground truth comes from the filename:

    <card_id>_<language>[_anything].<ext>

    OP09-093_en.jpg          OP09-093, English
    ST01-001_jp_angle.jpg    ST01-001, Japanese, shot at an angle
    OP01-029_r1_en_02.png    OP01-029_r1 — a specific printing

Any suffix after the language is free text, for describing the shot.

Usage:
    py backend/scripts/gate_eval.py [--save-rectified]
"""

import argparse
import re
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db, detection, hashing, recognition
from app.config import DATA_DIR

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

PHOTO_DIR = DATA_DIR / "photos"
EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".webp"}

# <card id>_<language>, where the id may itself carry a _p1 / _r1 printing suffix.
NAME_RE = re.compile(r"^(?P<card>[A-Z0-9]+-[A-Z0-9]+(?:_[pr]\d+)?)_(?P<lang>en|jp)",
                     re.IGNORECASE)


def parse_name(path: Path):
    match = NAME_RE.match(path.stem)
    if not match:
        return None, None
    return match.group("card").upper().replace("_P", "_p").replace("_R", "_r"), \
        match.group("lang").lower()


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure the step-5 recognition gate.")
    parser.add_argument("--save-rectified", action="store_true",
                        help="write each deskewed card next to the photo, to eyeball "
                             "what the hasher actually saw when a match fails")
    parser.add_argument("--dir", type=Path, default=PHOTO_DIR)
    args = parser.parse_args()

    photos = sorted(p for p in args.dir.glob("*") if p.suffix.lower() in EXTENSIONS)
    if not photos:
        print(f"No photographs in {args.dir}\n\n"
              f"Drop them there named <card_id>_<language>.jpg, for example\n"
              f"  OP09-093_en.jpg\n  ST01-001_jp_angle.jpg", file=sys.stderr)
        return 1

    conn = db.connect()
    catalogue = recognition.Catalogue(conn)
    print(f"Catalogue: {len(catalogue)} printings")
    print(f"Photographs: {len(photos)}\n")

    unlabelled, results = [], []
    for path in photos:
        card_id, language = parse_name(path)
        if card_id is None:
            unlabelled.append(path.name)
            continue

        image = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            results.append((path, card_id, language, None, None, "unreadable file"))
            continue

        corners = detection.find_card(image)
        if corners is None:
            results.append((path, card_id, language, None, None, "no card detected"))
            continue

        rectified = detection.deskew(image, corners)
        if args.save_rectified:
            cv2.imencode(".png", rectified)[1].tofile(
                str(path.with_name(f"{path.stem}__rectified.png")))

        best = None
        for variant in detection.orientations(rectified):
            query = hashing.phash_rgb(
                hashing.crop_region(
                    Image.fromarray(cv2.cvtColor(variant, cv2.COLOR_BGR2RGB)), "art"))
            result = catalogue.identify(query, top=3, max_distance=192)
            if result.best and (best is None or result.best.distance < best.best.distance):
                best = result

        results.append((path, card_id, language, best, best.best if best else None, None))

    report(results, unlabelled)
    conn.close()
    return 0


def report(results, unlabelled) -> None:
    header = (f"{'photo':<34}{'expected':<16}{'matched':<16}"
              f"{'dist':>6}{'margin':>8}  verdict")
    print(header)
    print("-" * len(header))

    number_ok = language_ok = printing_ok = detected = 0
    distances, margins = [], []

    for path, card_id, language, result, best, error in results:
        expected_number = card_id.split("_")[0]
        if error:
            print(f"{path.name[:33]:<34}{expected_number:<16}{'-':<16}"
                  f"{'-':>6}{'-':>8}  {error}")
            continue

        detected += 1
        got_number = best.card_number if best else "-"
        ok = best is not None and got_number == expected_number
        number_ok += ok
        if ok:
            language_ok += best.language == language
            printing_ok += any(p.card_id == card_id
                               and p.distance == best.distance for p in best.printings)
            distances.append(best.distance)
            if result.margin is not None:
                margins.append(result.margin)

        verdict = "OK" if ok else "WRONG"
        if ok and not result.confident:
            verdict = "ok (low margin)"
        print(f"{path.name[:33]:<34}{expected_number:<16}{got_number:<16}"
              f"{best.distance if best else '-':>6}"
              f"{result.margin if result and result.margin is not None else '-':>8}"
              f"  {verdict}")

    total = len(results)
    print(f"\n{'=' * 60}\nGATE RESULT over {total} photographs")
    print(f"  card detected      : {detected}/{total} ({detected / total:.1%})")
    print(f"  card number correct: {number_ok}/{total} ({number_ok / total:.1%})")
    if number_ok:
        print(f"  language correct   : {language_ok}/{number_ok} "
              f"({language_ok / number_ok:.1%}) — expected to be poor, the art crop "
              f"has no text")
        print(f"  exact printing tied: {printing_ok}/{number_ok}")
        print(f"  distance  median {np.median(distances):.0f}  p95 "
              f"{np.percentile(distances, 95):.0f}  max {max(distances)}")
        if margins:
            print(f"  margin    median {np.median(margins):.0f}  min {min(margins)}")

    if unlabelled:
        print(f"\n  {len(unlabelled)} file(s) skipped, name does not start with "
              f"<card_id>_<language>:")
        for name in unlabelled[:10]:
            print(f"    {name}")

    print("\n  Compare against the synthetic baseline in the README: the composite"
          "\n  harness reached 76-100% depending on the scene. A real rate far below"
          "\n  that points at print-versus-render colour drift, which is exactly what"
          "\n  this measurement exists to expose. Re-run with --save-rectified to see"
          "\n  what the hasher was given for the failures.")


if __name__ == "__main__":
    raise SystemExit(main())
