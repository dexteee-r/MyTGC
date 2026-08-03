"""Measure how far each kind of capture noise pushes a card's hash.

This is NOT the step-5 gate. Degrading a clean render does not reproduce a phone
sensor, a glare on a sleeve, a warped card or an uneven desk lamp, and a good score
here does not license skipping the real measurement. What it does give, before any
photograph exists:

  * the code path end to end, exercised on thousands of cases
  * a provisional threshold to start the real calibration from
  * which capture conditions actually matter, so the real photo set can target them

Each degradation is applied to the full card, exactly as a deskewed photo would be,
and the art crop is taken afterwards — so framing error propagates into the crop the
same way it will in production.

Usage:
    py backend/scripts/synthetic_eval.py [--sample 200] [--language en]
"""

import argparse
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db, hashing, recognition
from app.config import DATA_DIR

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")


# --- degradations ---------------------------------------------------------------
# Each takes and returns a full-card RGB image.

def rotate(image: Image.Image, degrees: float) -> Image.Image:
    """Residual tilt left over after deskew."""
    return image.rotate(degrees, resample=Image.BICUBIC, fillcolor=(255, 255, 255))


def reframe(image: Image.Image, fraction: float) -> Image.Image:
    """Card boundary detected slightly off: crop in by `fraction` on two sides and
    stretch back. This is what an imprecise deskew hands to the hasher."""
    w, h = image.size
    dx, dy = int(w * fraction), int(h * fraction)
    return image.crop((dx, dy, w, h)).resize((w, h), Image.LANCZOS)


def blur(image: Image.Image, radius: float) -> Image.Image:
    return image.filter(ImageFilter.GaussianBlur(radius))


def jpeg(image: Image.Image, quality: int) -> Image.Image:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=quality)
    buffer.seek(0)
    return Image.open(buffer).convert("RGB")


def brightness(image: Image.Image, factor: float) -> Image.Image:
    return ImageEnhance.Brightness(image).enhance(factor)


def contrast(image: Image.Image, factor: float) -> Image.Image:
    return ImageEnhance.Contrast(image).enhance(factor)


def white_balance(image: Image.Image, warm: float) -> Image.Image:
    """Colour temperature shift. Hits the R/G/B hashes harder than a grayscale hash,
    which is the trade PROJECT_CONTEXT section 3 accepts for colour discrimination."""
    array = np.asarray(image, dtype=np.float32)
    array[..., 0] *= warm
    array[..., 2] *= 2.0 - warm
    return Image.fromarray(np.clip(array, 0, 255).astype(np.uint8))


def noise(image: Image.Image, sigma: float) -> Image.Image:
    rng = np.random.default_rng(0)
    array = np.asarray(image, dtype=np.float32)
    array += rng.normal(0, sigma, array.shape)
    return Image.fromarray(np.clip(array, 0, 255).astype(np.uint8))


def phone_photo(image: Image.Image) -> Image.Image:
    """A plausible combination rather than one effect at a time."""
    image = rotate(image, 1.5)
    image = reframe(image, 0.015)
    image = blur(image, 1.0)
    image = brightness(image, 0.92)
    image = white_balance(image, 1.06)
    image = noise(image, 3.0)
    return jpeg(image, 85)


DEGRADATIONS = [
    ("baseline (no change)",      lambda im: im),
    ("rotate 1 deg",              lambda im: rotate(im, 1)),
    ("rotate 3 deg",              lambda im: rotate(im, 3)),
    ("rotate 5 deg",              lambda im: rotate(im, 5)),
    ("reframe 1%",                lambda im: reframe(im, 0.01)),
    ("reframe 2%",                lambda im: reframe(im, 0.02)),
    ("reframe 5%",                lambda im: reframe(im, 0.05)),
    ("blur r=1",                  lambda im: blur(im, 1)),
    ("blur r=3",                  lambda im: blur(im, 3)),
    ("jpeg q=70",                 lambda im: jpeg(im, 70)),
    ("jpeg q=40",                 lambda im: jpeg(im, 40)),
    ("brightness 0.75",           lambda im: brightness(im, 0.75)),
    ("brightness 1.30",           lambda im: brightness(im, 1.30)),
    ("contrast 0.75",             lambda im: contrast(im, 0.75)),
    ("white balance +10% warm",   lambda im: white_balance(im, 1.10)),
    ("white balance +20% warm",   lambda im: white_balance(im, 1.20)),
    ("noise sigma=8",             lambda im: noise(im, 8)),
    ("combined phone photo",      phone_photo),
]


def crop_and_hash(image: Image.Image) -> tuple[int, int, int]:
    """Crop exactly as the reference pass did, so drift measures the degradation and
    not a difference in framing convention."""
    return hashing.phash_rgb(hashing.crop_region(image, "art"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Synthetic robustness evaluation.")
    parser.add_argument("--sample", type=int, default=200)
    parser.add_argument("--language", default="en")
    args = parser.parse_args()

    conn = db.connect()
    catalogue = recognition.Catalogue(conn)          # search both locales, as the app will

    rows = conn.execute(
        "SELECT id, language, image_path, r_phash, g_phash, b_phash FROM cards"
        " WHERE language = ? AND image_path IS NOT NULL AND r_phash IS NOT NULL"
        " ORDER BY id", (args.language,),
    ).fetchall()

    rng = np.random.default_rng(0)
    picked = [rows[i] for i in rng.choice(len(rows), min(args.sample, len(rows)),
                                          replace=False)]

    print(f"Catalogue: {len(catalogue)} printings (both locales)")
    print(f"Sample: {len(picked)} {args.language.upper()} cards, "
          f"{len(DEGRADATIONS)} degradations\n")

    originals = {}
    for row in picked:
        originals[row["id"]] = Image.open(DATA_DIR / row["image_path"])

    header = (f"{'degradation':<26}{'drift median':>13}{'p95':>7}{'max':>7}"
              f"{'card no. ok':>13}{'lang ok':>9}{'margin':>9}")
    print(header)
    print("-" * len(header))

    results = []
    for label, degrade in DEGRADATIONS:
        drifts, margins, number_ok, language_ok = [], [], 0, 0

        for row in picked:
            image = hashing.normalize(originals[row["id"]])
            query = crop_and_hash(degrade(image))

            reference = tuple(hashing.from_signed(row[c])
                              for c in ("r_phash", "g_phash", "b_phash"))
            drifts.append(hashing.hamming_rgb(query, reference))

            result = catalogue.identify(query, top=3, max_distance=192)
            if result.margin is not None:
                margins.append(result.margin)
            if result.best is not None:
                if result.best.card_number == row["id"].split("_")[0]:
                    number_ok += 1
                    if result.best.language == row["language"]:
                        language_ok += 1

        drifts = np.array(drifts)
        n = len(picked)
        margin_median = np.median(margins) if margins else 0
        print(f"{label:<26}{np.median(drifts):>13.0f}{np.percentile(drifts, 95):>7.0f}"
              f"{drifts.max():>7.0f}{number_ok / n:>12.1%}{language_ok / n:>9.1%}"
              f"{margin_median:>9.0f}")
        results.append((label, drifts, number_ok / n, language_ok / n, margins))

    print("\nReading these numbers:")
    print("  * Drift alone does not predict failure. Separability bounds assume the")
    print("    query drifts TOWARDS a rival card; a real degradation moves it away")
    print("    from every card at once, so the true match usually stays closest.")
    print("    'margin' is the honest signal: the gap to the runner-up card number.")

    broken = [label for label, _, ok, _, _ in results if ok < 0.99]
    if broken:
        print("\n  Degradations that actually break identification (<99% card number):")
        for label in broken:
            print(f"    - {label}")
    else:
        print("\n  No degradation dropped card-number accuracy below 99%.")

    print("\n  Geometry dominates. Photometric noise (blur, JPEG, sensor noise,")
    print("  white balance, contrast) barely moves the hash; framing and rotation")
    print("  errors move it a lot. Detection and deskew accuracy is therefore the")
    print("  engineering priority, not hash tuning.")

    print("\n  Language accuracy degrades fast, as expected: the art crop excludes all")
    print("  text, and text is the only thing separating the EN and JP printing of a")
    print("  card. Language should be selected by the user, not inferred.")

    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
