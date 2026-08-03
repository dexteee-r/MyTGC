"""End-to-end evaluation of detect -> deskew -> crop -> hash -> match.

synthetic_eval.py degraded an already-framed card. This one starts from a synthetic
*scene*: the card warped in perspective onto a background, lit unevenly, with glare,
then handed to the detector with no idea where it is. It exercises the stage that
matters most — synthetic_eval.py showed a 5% framing error costs everything.

What it can and cannot show. Perspective rectification is pure geometry, so measuring
it on composites is legitimate. What it cannot measure is the difference between
printed ink and the official render: the card pasted here IS the reference image, so
colour, gloss and foil are identical by construction. Backgrounds are procedural, not
photographs, so a detection rate here is an upper bound on the real one.

Usage:
    py backend/scripts/composite_eval.py [--sample 100]
"""

import argparse
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

CANVAS = (1400, 1800)        # width, height of the synthetic photo


# --- backgrounds ----------------------------------------------------------------

def background(kind: str, rng: np.random.Generator) -> np.ndarray:
    w, h = CANVAS
    if kind == "plain":
        base = np.full((h, w, 3), float(rng.integers(40, 210)))
        return np.clip(base + rng.normal(0, 6, (h, w, 3)), 0, 255).astype(np.uint8)

    if kind == "wood":
        rows = rng.normal(0, 18, (h, 1)) + np.linspace(90, 150, h).reshape(h, 1)
        grain = np.repeat(rows, w, axis=1)
        grain += rng.normal(0, 4, (h, w))
        img = np.clip(grain, 0, 255).astype(np.uint8)
        return cv2.merge([img, (img * 0.75).astype(np.uint8), (img * 0.55).astype(np.uint8)])

    if kind == "cluttered":
        # Other cards and objects around the target: the case that defeats a naive
        # "largest contour" detector.
        img = np.full((h, w, 3), rng.integers(60, 140), dtype=np.uint8)
        for _ in range(7):
            x, y = rng.integers(0, w - 300), rng.integers(0, h - 400)
            colour = tuple(int(c) for c in rng.integers(0, 255, 3))
            cv2.rectangle(img, (x, y), (x + rng.integers(150, 400),
                                        y + rng.integers(200, 500)), colour, -1)
        return img

    if kind == "dim":
        # Low light: dark, and noisy the way a phone sensor is when it pushes ISO.
        base = np.full((h, w, 3), float(rng.integers(18, 42)))
        return np.clip(base + rng.normal(0, 12, (h, w, 3)), 0, 255).astype(np.uint8)

    raise ValueError(kind)


# --- scene construction ---------------------------------------------------------

def paste_card(card: np.ndarray, bg: np.ndarray, tilt: float,
               rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """Warp the card into the scene with a random perspective of the given strength.

    Returns the scene and the ground-truth quadrilateral, so detection error can be
    measured in pixels rather than inferred from the match rate.
    """
    h, w = card.shape[:2]
    canvas_w, canvas_h = CANVAS

    scale = rng.uniform(0.55, 0.75)
    target_w, target_h = canvas_w * scale * (w / h) * (h / w), canvas_h * scale
    target_w = target_h * (w / h)
    cx, cy = canvas_w / 2, canvas_h / 2

    base = np.array([
        [cx - target_w / 2, cy - target_h / 2],
        [cx + target_w / 2, cy - target_h / 2],
        [cx + target_w / 2, cy + target_h / 2],
        [cx - target_w / 2, cy + target_h / 2],
    ], dtype=np.float32)

    # Perspective: displace each corner by up to `tilt` of the card's size, plus a
    # small in-plane rotation.
    jitter = rng.uniform(-tilt, tilt, (4, 2)) * np.array([target_w, target_h])
    angle = np.deg2rad(rng.uniform(-8, 8))
    rotation = np.array([[np.cos(angle), -np.sin(angle)],
                         [np.sin(angle), np.cos(angle)]], dtype=np.float32)
    quad = ((base + jitter) - [cx, cy]) @ rotation.T + [cx, cy]

    source = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(source, quad.astype(np.float32))

    warped = cv2.warpPerspective(card, matrix, CANVAS)
    mask = cv2.warpPerspective(np.full((h, w), 255, np.uint8), matrix, CANVAS)
    scene = bg.copy()
    scene[mask > 0] = warped[mask > 0]
    return scene, detection.order_corners(quad.astype(np.float32))


def light_and_blur(scene: np.ndarray, rng: np.random.Generator,
                   glare: bool) -> np.ndarray:
    h, w = scene.shape[:2]

    # Uneven lighting: a broad linear gradient across the frame.
    gx = np.linspace(rng.uniform(0.7, 1.0), rng.uniform(1.0, 1.3), w)
    gy = np.linspace(rng.uniform(0.8, 1.0), rng.uniform(1.0, 1.2), h)
    gradient = np.outer(gy, gx)[..., None]
    scene = np.clip(scene.astype(np.float32) * gradient, 0, 255)

    if glare:
        # A specular highlight, as a sleeve or a glossy card throws back a lamp.
        overlay = np.zeros((h, w), np.float32)
        centre = (int(rng.uniform(0.3, 0.7) * w), int(rng.uniform(0.2, 0.6) * h))
        cv2.ellipse(overlay, centre, (int(w * 0.18), int(h * 0.08)),
                    rng.uniform(0, 180), 0, 360, 1.0, -1)
        overlay = cv2.GaussianBlur(overlay, (0, 0), w * 0.05)
        scene = np.clip(scene + overlay[..., None] * rng.uniform(70, 130), 0, 255)

    scene = scene.astype(np.uint8)
    scene = cv2.GaussianBlur(scene, (0, 0), rng.uniform(0.6, 1.8))
    scene = np.clip(scene.astype(np.float32)
                    + rng.normal(0, 3.0, scene.shape), 0, 255).astype(np.uint8)

    ok, encoded = cv2.imencode(".jpg", scene, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return cv2.imdecode(encoded, cv2.IMREAD_COLOR) if ok else scene


CONDITIONS = [
    # label,                bg kind,        tilt,  glare, upside down
    ("flat, plain bg",      "plain",        0.005, False, False),
    ("flat, wood bg",       "wood",         0.005, False, False),
    ("slight angle",        "wood",         0.03,  False, False),
    ("strong angle",        "wood",         0.07,  False, False),
    ("cluttered bg",        "cluttered",    0.03,  False, False),
    ("dim / high ISO",      "dim",          0.03,  False, False),
    ("glare on card",       "wood",         0.03,  True,  False),
    ("upside down",         "wood",         0.03,  False, True),
]


def main() -> int:
    parser = argparse.ArgumentParser(description="End-to-end pipeline evaluation.")
    parser.add_argument("--sample", type=int, default=100)
    parser.add_argument("--language", default="en")
    args = parser.parse_args()

    conn = db.connect()
    catalogue = recognition.Catalogue(conn)
    rows = conn.execute(
        "SELECT id, language, image_path FROM cards WHERE language = ?"
        " AND image_path IS NOT NULL AND r_phash IS NOT NULL ORDER BY id",
        (args.language,),
    ).fetchall()

    rng = np.random.default_rng(0)
    picked = [rows[i] for i in rng.choice(len(rows), min(args.sample, len(rows)),
                                          replace=False)]

    print(f"Catalogue: {len(catalogue)} printings")
    print(f"Sample: {len(picked)} {args.language.upper()} cards x "
          f"{len(CONDITIONS)} scene conditions\n")

    header = (f"{'condition':<20}{'detected':>10}{'correct':>10}"
              f"{'distance med':>14}{'margin med':>12}{'framing err':>13}")
    print(header)
    print("-" * len(header))

    for label, bg_kind, tilt, glare, flip in CONDITIONS:
        detected = correct = 0
        distances, margins, corner_errors = [], [], []

        for index, row in enumerate(picked):
            # Independent streams per card, so every condition places the card
            # identically. Sharing one generator made a cluttered background — which
            # consumes far more draws than a plain one — shift the card's position and
            # tilt as well, and the columns stopped being comparable.
            place_rng = np.random.default_rng(1000 + index)
            bg_rng = np.random.default_rng(2000 + index)
            light_rng = np.random.default_rng(3000 + index)

            pil = hashing.normalize(Image.open(DATA_DIR / row["image_path"]))
            card = cv2.cvtColor(np.asarray(pil), cv2.COLOR_RGB2BGR)
            if flip:
                card = cv2.rotate(card, cv2.ROTATE_180)

            scene, truth = paste_card(card, background(bg_kind, bg_rng),
                                      tilt, place_rng)
            scene = light_and_blur(scene, light_rng, glare)

            corners = detection.find_card(scene)
            if corners is None:
                continue
            detected += 1

            # Corner error as a share of the card's own size: this is directly the
            # "reframe %" that synthetic_eval.py showed to be the decisive factor.
            card_size = np.linalg.norm(truth[2] - truth[0])
            corner_errors.append(
                float(np.linalg.norm(corners - truth, axis=1).mean() / card_size)
            )
            rectified = detection.deskew(scene, corners)

            # Geometry cannot resolve which way up the card was; try both.
            best = None
            for variant in detection.orientations(rectified):
                image = Image.fromarray(cv2.cvtColor(variant, cv2.COLOR_BGR2RGB))
                query = hashing.phash_rgb(hashing.crop_region(image, "art"))
                result = catalogue.identify(query, top=3, max_distance=192)
                if result.best is not None and (best is None
                                                or result.best.distance < best.best.distance):
                    best = result

            if best is None or best.best is None:
                continue
            distances.append(best.best.distance)
            if best.margin is not None:
                margins.append(best.margin)
            if best.best.card_number == row["id"].split("_")[0]:
                correct += 1

        n = len(picked)
        med_d = np.median(distances) if distances else float("nan")
        med_m = np.median(margins) if margins else float("nan")
        med_e = np.median(corner_errors) if corner_errors else float("nan")
        print(f"{label:<20}{detected / n:>9.1%}{correct / n:>10.1%}"
              f"{med_d:>14.0f}{med_m:>12.0f}{med_e:>12.1%}")

    print("\n  'detected' is the share of scenes where a card-shaped quadrilateral was")
    print("  found at all; 'correct' is the share where the right card number came out")
    print("  of the full pipeline. The gap between them is deskew precision.")
    print("\n  Backgrounds are procedural and the pasted card is the reference image")
    print("  itself, so these rates are an upper bound. Print colour, gloss and foil")
    print("  are untested by construction and remain for the step-5 gate.")

    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
