"""Build step 5, second half — pick the rejection threshold from the real photographs.

gate_eval.py answers "how often is the top match right". This answers the question
that actually decides the product: **can a wrong answer be told apart from a right one
before it is shown to the user?**

PROJECT_CONTEXT.md section 3 already provides for this — manual search is the third
stage of the pipeline. A miss that routes to manual search costs the user a few
seconds. A miss presented as a confident answer puts the wrong card in their
collection, silently. The two are not equally bad, so the threshold is not a detail.

Usage:
    py backend/scripts/calibrate_threshold.py
"""

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
NAME_RE = re.compile(r"^(?P<card>[A-Z0-9]+-[A-Z0-9]+(?:_[pr]\d+)?)_(?P<lang>en|jp)",
                     re.IGNORECASE)


def evaluate(catalogue, path: Path):
    match = NAME_RE.match(path.stem)
    if not match:
        return None
    expected = match.group("card").upper().split("_")[0]

    image = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    rectified = detection.detect_and_deskew(image)
    if rectified is None:
        return None

    best = None
    for variant in detection.orientations(rectified):
        query = hashing.phash_rgb(
            hashing.crop_region(
                Image.fromarray(cv2.cvtColor(variant, cv2.COLOR_BGR2RGB)), "art"))
        # top is large so the true card can be located even when it is not first.
        result = catalogue.identify(query, top=300, max_distance=192)
        if result.best and (best is None or result.best.distance < best.best.distance):
            best = result

    rank = next((i + 1 for i, c in enumerate(best.candidates)
                 if c.card_number == expected), None)
    true_distance = next((c.distance for c in best.candidates
                          if c.card_number == expected), None)
    return {
        "photo": path.name, "expected": expected,
        "got": best.best.card_number, "distance": best.best.distance,
        "margin": best.margin if best.margin is not None else 0,
        "rank": rank, "true_distance": true_distance,
        "correct": best.best.card_number == expected,
    }


def main() -> int:
    conn = db.connect()
    catalogue = recognition.Catalogue(conn)
    results = [r for r in (evaluate(catalogue, p)
                           for p in sorted(PHOTO_DIR.glob("*.jpg"))) if r]
    if not results:
        print(f"No labelled photographs in {PHOTO_DIR}", file=sys.stderr)
        return 1

    print(f"{'photo':<26}{'top 1':<11}{'dist':>5}{'margin':>7}"
          f"{'true rank':>11}{'true dist':>10}")
    print("-" * 70)
    for r in results:
        flag = "" if r["correct"] else "   <-- wrong"
        print(f"{r['photo'][:25]:<26}{r['got']:<11}{r['distance']:>5}{r['margin']:>7}"
              f"{str(r['rank']):>11}{str(r['true_distance']):>10}{flag}")

    ok = [r for r in results if r["correct"]]
    bad = [r for r in results if not r["correct"]]
    print(f"\n{len(ok)}/{len(results)} correct ({len(ok) / len(results):.1%})")
    print(f"  correct: distance {min(r['distance'] for r in ok)}"
          f"..{max(r['distance'] for r in ok)}")
    if bad:
        print(f"  wrong  : distance {min(r['distance'] for r in bad)}"
              f"..{max(r['distance'] for r in bad)}")

    print("\nRejection threshold — anything beyond it goes to manual search:")
    print(f"  {'cutoff':>8}{'kept correct':>15}{'wrong shown':>14}{'sent to search':>16}")
    best_cutoff = None
    for cutoff in range(40, 66, 2):
        kept_ok = sum(1 for r in ok if r["distance"] < cutoff)
        leaked = sum(1 for r in bad if r["distance"] < cutoff)
        rejected = len(results) - kept_ok - leaked
        print(f"  {cutoff:>8}{kept_ok:>10}/{len(ok):<4}{leaked:>10}/{len(bad):<4}"
              f"{rejected:>12}")
        if leaked == 0 and (best_cutoff is None or kept_ok > best_cutoff[1]):
            best_cutoff = (cutoff, kept_ok)

    if best_cutoff:
        cutoff, kept = best_cutoff
        print(f"\n  Best clean cutoff: {cutoff}. Keeps {kept}/{len(ok)} correct answers "
              f"and shows zero wrong ones;\n  the remaining {len(results) - kept} "
              f"photographs fall through to manual search.")
    else:
        print("\n  No cutoff separates right from wrong answers on this sample. The "
              "confidence\n  signal is not usable as it stands — revise the pipeline "
              "rather than shipping it.")

    ranked = [r for r in bad if r["rank"]]
    print(f"\nAmong the {len(bad)} failures, where did the true card actually land?")
    if ranked:
        print(f"  in the candidate list at rank: {sorted(r['rank'] for r in ranked)}")
        top3 = sum(1 for r in ranked if r["rank"] <= 3)
        print(f"  within the top 3: {top3}/{len(bad)} — a candidate list would "
              f"recover these")
    print(f"  absent entirely: {sum(1 for r in bad if not r['rank'])}")

    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
