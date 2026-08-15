"""Genere icon-180/192/512.png a partir de la geometrie de public/icon.svg.

Pourquoi un script Python plutot qu'un rasteriseur SVG : les seuls disponibles
(sharp, resvg, cairosvg) sont des modules natifs. En devDependency, `npm ci` les
installerait aussi sur le serveur d'autodeploiement, ou un echec de compilation
casserait un deploiement pour trois images qui changent une fois par an.

La geometrie ci-dessous est donc recopiee de public/icon.svg. C'est une duplication,
et elle derive si on ne touche qu'un seul des deux fichiers. Deux garde-fous :
`--check` relit le SVG et compare les nombres, et le script s'arrete si l'un d'eux
ne correspond plus.

    python scripts/make_icons.py           # ecrit les PNG
    python scripts/make_icons.py --check   # verifie seulement la coherence avec le SVG
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parent.parent / "public"
SVG = PUBLIC / "icon.svg"
SIZES = (180, 192, 512)
SS = 4  # supersampling avant reduction

SEA = (6, 23, 29, 255)
DISC = (240, 192, 74, 255)
HORIZON = (255, 210, 122, 255)
REFLECTIONS = ((12, 44, 54, 255), (8, 34, 44, 255))
STOPS = ((0.0, (255, 245, 214)), (0.60, (240, 192, 74)), (1.0, (201, 146, 42)))

# --- geometrie, en unites du viewBox 512, origine du groupe a (256, 320) ------
ORIGIN = (256, 320)
CARDS = (  # (largeur, y_haut, y_bas, rayon, angle SVG)
    (64, -190, -80, 6, -68),
    (64, -200, -90, 6, -34),
    (64, -210, -100, 6, 0),
    (64, -200, -90, 6, 34),
    (64, -190, -80, 6, 68),
)
DISC_R = 90
HORIZON_HALF = 192
HORIZON_W = 16
REFLECTION_PATHS = (
    ((-140, 20), (140, 20), (0, 60), (0, 40)),
    ((-90, 50), (90, 50), (0, 80), (0, 65)),
)


def check_against_svg():
    """Relit icon.svg et verifie que les nombres d'ici sont toujours les siens."""
    svg = SVG.read_text(encoding="utf-8")
    problems = []

    rects = re.findall(
        r'<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"'
        r' rx="([\d.]+)"(?: transform="rotate\((-?[\d.]+)\)")?',
        svg,
    )
    found = [
        (float(w), float(y), float(y) + float(h), float(rx), float(a or 0))
        for _x, y, w, h, rx, a in rects
    ]
    if found != [tuple(float(v) for v in c) for c in CARDS]:
        problems.append(f"cartes: SVG {found} != script {CARDS}")

    arc = re.search(r'A (\d+) \d+ 0 0 1', svg)
    if not arc or float(arc.group(1)) != DISC_R:
        problems.append(f"rayon du disque: SVG {arc and arc.group(1)} != script {DISC_R}")

    line = re.search(r'<line x1="(-?[\d.]+)".*?stroke-width="([\d.]+)"', svg, re.S)
    if not line or (float(line.group(1)), float(line.group(2))) != (-HORIZON_HALF, HORIZON_W):
        problems.append(f"horizon: SVG {line and line.groups()} != script "
                        f"{(-HORIZON_HALF, HORIZON_W)}")

    if problems:
        print("icon.svg et make_icons.py ont derive :", file=sys.stderr)
        for p in problems:
            print("  -", p, file=sys.stderr)
        return False
    return True


def grad_at(t):
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        if t0 <= t <= t1:
            f = (t - t0) / (t1 - t0)
            return tuple(int(c0[i] + (c1[i] - c0[i]) * f) for i in range(3)) + (255,)
    return STOPS[-1][1] + (255,)


def quad(p0, p1, p2, n=80):
    return [(
        (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
        (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
    ) for t in (i / n for i in range(n + 1))]


def render(px):
    n = px * SS
    k = n / 512
    cx, cy = (v * k for v in ORIGIN)
    img = Image.new("RGBA", (n, n), SEA)

    for (a, b, c1, c2), colour in zip(REFLECTION_PATHS, REFLECTIONS):
        pts = quad(a, c1, b) + quad(b, c2, a)
        layer = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        ImageDraw.Draw(layer).polygon(
            [(cx + x * k, cy + y * k) for x, y in pts], fill=colour)
        img.alpha_composite(layer)

    for w, y_top, y_bot, rx, angle in CARDS:
        x0, x1 = cx - w / 2 * k, cx + w / 2 * k
        y0, y1 = cy + y_top * k, cy + y_bot * k
        mask = Image.new("L", (n, n), 0)
        ImageDraw.Draw(mask).rounded_rectangle([x0, y0, x1, y1], radius=rx * k, fill=255)
        grad = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        gd = ImageDraw.Draw(grad)
        h = int(y1 - y0)
        for i in range(h + 1):
            gd.line([(x0, y0 + i), (x1, y0 + i)], fill=grad_at(i / max(h, 1)))
        layer = Image.composite(grad, Image.new("RGBA", (n, n), (0, 0, 0, 0)), mask)
        if angle:
            layer = layer.rotate(-angle, resample=Image.BICUBIC, center=(cx, cy))
        img.alpha_composite(layer)

    d = ImageDraw.Draw(img)
    r = DISC_R * k
    d.pieslice([cx - r, cy - r, cx + r, cy + r], 180, 360, fill=DISC)

    hw = HORIZON_W / 2 * k
    hh = HORIZON_HALF * k
    d.rectangle([cx - hh, cy - hw, cx + hh, cy + hw], fill=HORIZON)
    for sx in (cx - hh, cx + hh):
        d.ellipse([sx - hw, cy - hw, sx + hw, cy + hw], fill=HORIZON)

    return img.resize((px, px), Image.LANCZOS).convert("RGB")


def main():
    if not check_against_svg():
        return 1
    if "--check" in sys.argv:
        print("icon.svg et make_icons.py sont d'accord.")
        return 0
    for size in SIZES:
        out = PUBLIC / f"icon-{size}.png"
        render(size).save(out, optimize=True)
        print(f"{out.name}  {out.stat().st_size // 1024} Ko")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
