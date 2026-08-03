"""Perceptual hashing of card art.

PROJECT_CONTEXT.md section 3: hash the R, G and B channels separately rather than a
single grayscale hash. Card colour is a core One Piece attribute, and three channels
separate cards that share a layout but not a colour scheme.
"""

import imagehash
from PIL import Image

# 8x8 DCT low-frequency block -> a 64-bit hash per channel.
HASH_SIZE = 8
HASH_BITS = HASH_SIZE * HASH_SIZE

# Fraction of the card to hash: (left, top, right, bottom).
#
# The official card list serves every image with a translucent white "SAMPLE"
# watermark that physical cards do not carry. Hashing a region containing it would
# compare a watermarked reference against an unwatermarked photo — a systematic bias
# on every single card, which is far worse than losing some area.
#
# measure_watermark.py puts the opaque core at y 0.471-0.543 (x 0.207-0.733) over a
# 600-card sample, with a faint halo from about y 0.43. The crop therefore stops at
# 0.42, keeping the illustration band above the watermark and dropping the outer
# border. Tunable at the step-5 calibration; re-running compute_phashes.py --all
# after changing it costs a couple of minutes and no re-download.
ART_BOX = (0.05, 0.05, 0.95, 0.42)


def load_card_image(path, region: str = "full") -> Image.Image:
    """Open a cached card image as RGB.

    The official card list serves palette-mode PNGs; splitting those without
    converting first yields a single index channel instead of R/G/B.

    21 of them also carry byte transparency. Converting those straight to RGB lets
    Pillow resolve transparent pixels to whatever the palette happens to hold, which
    is arbitrary and could differ between Pillow versions. Compositing over an
    explicit white background instead keeps the hash reproducible.
    """
    return crop_region(normalize(Image.open(path)), region)


def normalize(img: Image.Image) -> Image.Image:
    """Flatten an image to RGB over an explicit white background."""
    if img.mode in ("RGBA", "LA") or "transparency" in img.info:
        background = Image.new("RGBA", img.size, (255, 255, 255, 255))
        img = Image.alpha_composite(background, img.convert("RGBA"))
    return img.convert("RGB")


def crop_region(img: Image.Image, region: str = "full") -> Image.Image:
    if region == "art":
        w, h = img.size
        left, top, right, bottom = ART_BOX
        img = img.crop((int(w * left), int(h * top), int(w * right), int(h * bottom)))
    elif region != "full":
        raise ValueError(f"unknown region {region!r}, expected 'full' or 'art'")
    return img


def phash_rgb(img: Image.Image) -> tuple[int, int, int]:
    """Return the (R, G, B) perceptual hashes as unsigned 64-bit integers."""
    return tuple(
        int(str(imagehash.phash(channel, hash_size=HASH_SIZE)), 16)
        for channel in img.split()
    )


# --- SQLite storage -------------------------------------------------------------
# A 64-bit hash is unsigned, but SQLite INTEGER is signed 64-bit and silently
# promotes anything above 2**63-1 to a float, destroying the low bits. Store the
# two's-complement reinterpretation and convert back on read; the bit pattern —
# the only thing Hamming distance cares about — survives intact.

_SIGN_BIT = 1 << (HASH_BITS - 1)
_MODULUS = 1 << HASH_BITS


def to_signed(value: int) -> int:
    return value - _MODULUS if value >= _SIGN_BIT else value


def from_signed(value: int) -> int:
    return value + _MODULUS if value < 0 else value


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def hamming_rgb(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    """Summed Hamming distance across the three channels. Max 192."""
    return sum(hamming(x, y) for x, y in zip(a, b))
