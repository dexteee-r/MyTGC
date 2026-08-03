"""Locate the SAMPLE watermark band on the official card images.

The card list serves every image with a translucent white "SAMPLE" overlay. Physical
cards do not have it, so any region containing it is a systematic difference between
the reference hash and a photographed card. This script measures where it sits so the
art crop can avoid it, instead of guessing from a couple of screenshots.

Method: the overlay is white and lands in roughly the same place on every card, so the
pixel-wise MINIMUM across many cards is elevated wherever it is always present — even
the darkest artwork gets lightened there. Averaging instead would drown it in art.

Usage:
    py backend/scripts/measure_watermark.py [--sample 400] [--language en]
"""

import argparse
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import DATA_DIR, IMAGE_CACHE_DIR

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

WIDTH, HEIGHT = 150, 210      # downsampled working size


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure the SAMPLE watermark band.")
    parser.add_argument("--sample", type=int, default=400, help="cards to inspect")
    parser.add_argument("--language", default="en")
    parser.add_argument("--save", action="store_true",
                        help="write the min-projection as a PNG for visual confirmation")
    args = parser.parse_args()

    # Reads the cache directly rather than cards.image_path: this is a diagnostic that
    # must work mid-download, before the importer has recorded any path.
    files = sorted((IMAGE_CACHE_DIR / args.language).glob("*.png"))
    if not files:
        print("No cached images yet — run download_images.py first.", file=sys.stderr)
        return 1

    random.seed(0)
    picked = random.sample(files, min(args.sample, len(files)))
    print(f"Inspecting {len(picked)} of {len(files)} cached {args.language.upper()} "
          f"cards at {WIDTH}x{HEIGHT}")

    stack = np.zeros((len(picked), HEIGHT, WIDTH), dtype=np.uint8)
    for i, path in enumerate(picked):
        img = Image.open(path).convert("L").resize((WIDTH, HEIGHT), Image.LANCZOS)
        stack[i] = np.asarray(img)

    minimum = stack.min(axis=0)

    # A row crossing the watermark has a high floor: every card is bright there.
    row_floor = minimum.mean(axis=1)
    baseline = np.median(row_floor)
    threshold = baseline + max(12.0, row_floor.std())

    flagged = np.flatnonzero(row_floor > threshold)
    print(f"  baseline floor {baseline:.1f}, threshold {threshold:.1f}")

    if flagged.size == 0:
        print("  no watermark band detected")
    else:
        top, bottom = flagged.min(), flagged.max()
        cols = np.flatnonzero(minimum[top:bottom + 1].mean(axis=0) > threshold)
        left, right = (cols.min(), cols.max()) if cols.size else (0, WIDTH - 1)
        print(f"  band rows {top}-{bottom} of {HEIGHT}  -> y {top / HEIGHT:.3f}"
              f" .. {(bottom + 1) / HEIGHT:.3f}")
        print(f"  band cols {left}-{right} of {WIDTH}   -> x {left / WIDTH:.3f}"
              f" .. {(right + 1) / WIDTH:.3f}")
        print(f"\n  safe art band above the watermark: y 0.000 .. {top / HEIGHT:.3f}")

    print("\n  row floor profile (y fraction: floor):")
    for y in range(0, HEIGHT, 10):
        bar = "#" * int((row_floor[y] - row_floor.min()) / 2)
        mark = " <-- watermark" if flagged.size and top <= y <= bottom else ""
        print(f"    {y / HEIGHT:.2f}  {row_floor[y]:6.1f}  {bar}{mark}")

    if args.save:
        out = DATA_DIR / "watermark_min_projection.png"
        Image.fromarray(minimum).save(out)
        print(f"\n  min-projection written to {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
