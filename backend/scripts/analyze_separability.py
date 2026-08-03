"""How far apart are the catalogue hashes from each other?

This is the ceiling on the recognition threshold, and it needs no photographs. If the
nearest neighbour of a card sits at distance D, then a photo of that card may be
misidentified once its hash drifts by roughly D/2. The threshold must live well below
half the nearest-neighbour distance, so this measures the budget available before any
real-world noise is introduced.

Also measures the EN/JP distance for the same card number: both printings share the
artwork but differ in text and colour rendering, so it is a free real-world sample of
"same art, different capture" — the closest proxy to a photograph available offline.

Usage:
    py backend/scripts/analyze_separability.py [--language en]
"""

import argparse
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db, hashing
from app.config import LANGUAGES

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

CHUNK = 512  # rows per distance-matrix block, keeps peak memory modest


def load_bits(conn, language: str) -> tuple[list[str], np.ndarray]:
    """Return (card ids, bit matrix of shape (n, 192) as float32).

    Float32 lets the Hamming distance run as a single BLAS matrix multiply, which is
    orders of magnitude faster than looping in Python over 22M pairs.
    """
    ids, packed = [], []
    for row in conn.execute(
        "SELECT id, r_phash, g_phash, b_phash FROM cards"
        " WHERE language = ? AND r_phash IS NOT NULL ORDER BY id", (language,)
    ):
        ids.append(row["id"])
        value = 0
        for column in ("r_phash", "g_phash", "b_phash"):
            value = (value << hashing.HASH_BITS) | hashing.from_signed(row[column])
        packed.append(value.to_bytes(24, "big"))

    bits = np.unpackbits(np.frombuffer(b"".join(packed), dtype=np.uint8))
    return ids, bits.reshape(len(ids), 192).astype(np.float32)


def nearest_neighbours(bits: np.ndarray, groups: np.ndarray):
    """Distance to the closest other row, and to the closest row of a different card
    number. Hamming via matrix product: d(a,b) = a.(1-b) + (1-a).b.

    The second figure is the one that bounds the threshold. Being close to another
    printing of the same number is harmless — both rows describe the same picture.
    What must stay far away is a genuinely different card.
    """
    n = bits.shape[0]
    inverse = 1.0 - bits
    best_dist = np.full(n, 999, dtype=np.int32)
    best_index = np.zeros(n, dtype=np.int64)
    other_dist = np.full(n, 999, dtype=np.int32)
    other_index = np.zeros(n, dtype=np.int64)

    for start in range(0, n, CHUNK):
        stop = min(start + CHUNK, n)
        block = (bits[start:stop] @ inverse.T) + (inverse[start:stop] @ bits.T)
        block = block.astype(np.int32)
        rows = np.arange(stop - start)
        # Exclude each row's distance to itself.
        block[rows, np.arange(start, stop)] = 999

        idx = block.argmin(axis=1)
        best_dist[start:stop] = block[rows, idx]
        best_index[start:stop] = idx

        # Now mask every row sharing this card's number and take the minimum again.
        masked = np.where(groups[start:stop, None] == groups[None, :], 999, block)
        idx = masked.argmin(axis=1)
        other_dist[start:stop] = masked[rows, idx]
        other_index[start:stop] = idx

    return best_dist, best_index, other_dist, other_index


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure catalogue separability.")
    parser.add_argument("--language", choices=sorted(LANGUAGES))
    args = parser.parse_args()

    conn = db.connect()
    languages = [args.language] if args.language else sorted(LANGUAGES)
    per_lang = {}

    for lang in languages:
        ids, bits = load_bits(conn, lang)
        print(f"\n=== {lang.upper()} — {len(ids)} hashed cards ===")

        bases = [cid.split("_")[0] for cid in ids]
        codes = {base: i for i, base in enumerate(sorted(set(bases)))}
        groups = np.array([codes[b] for b in bases], dtype=np.int32)

        distances, neighbours, other, other_idx = nearest_neighbours(bits, groups)
        per_lang[lang] = (ids, bits)

        print(f"  {len(codes)} distinct card numbers across {len(ids)} printings")
        print("\n  distance to the nearest DIFFERENT card number"
              " — this is what bounds the threshold:")
        for label, value in [
            ("min", other.min()), ("p1", np.percentile(other, 1)),
            ("p5", np.percentile(other, 5)), ("median", np.median(other)),
        ]:
            print(f"    {label:<7}{value:>7.1f}")
        print("\n    a photo is safe while its own drift stays under half of this:")
        for threshold in (8, 16, 24, 32, 40):
            unsafe = int((other < threshold * 2).sum())
            print(f"      drift <= {threshold:>2} bits: {len(ids) - unsafe:>5} cards safe"
                  f" ({1 - unsafe / len(ids):>6.2%}),  {unsafe:>4} at risk")

        print("  nearest-neighbour distance (0-192, summed over R/G/B):")
        for label, value in [
            ("min", distances.min()), ("p1", np.percentile(distances, 1)),
            ("p5", np.percentile(distances, 5)), ("median", np.median(distances)),
            ("p95", np.percentile(distances, 95)), ("max", distances.max()),
        ]:
            print(f"    {label:<7}{value:>7.1f}")

        identical = int((distances == 0).sum())
        print(f"\n    distance 0 (indistinguishable): {identical} cards "
              f"({identical / len(ids):.1%})")
        for threshold in (4, 8, 12, 16, 24, 32):
            count = int((distances <= threshold).sum())
            print(f"    within {threshold:>2}: {count:>5} cards ({count / len(ids):>5.1%})"
                  f"  -> a photo drifting {threshold // 2:>2} bits could confuse them")

        # The decisive split. A near neighbour that is another printing of the SAME
        # card number is benign: both rows describe the same picture on the same
        # physical card, so picking either still tells the user what they scanned.
        # A near neighbour with a DIFFERENT card number is a genuine misidentification.
        bases = [cid.split("_")[0] for cid in ids]
        same_base = np.array(
            [bases[i] == bases[neighbours[i]] for i in range(len(ids))]
        )
        print("\n    is the nearest neighbour the same card number, or a different card?")
        print("      threshold   same number (benign)   different card (RISK)")
        for threshold in (0, 4, 8, 16, 32, 48):
            within = distances <= threshold
            benign = int((within & same_base).sum())
            risk = int((within & ~same_base).sum())
            print(f"      <= {threshold:<8}{benign:>10} {benign / len(ids):>7.1%}"
                  f"      {risk:>8} {risk / len(ids):>7.2%}")

        # The tightest non-identical pairs are the ones that will actually break.
        risky = [(d, ids[i], ids[neighbours[i]])
                 for i, d in enumerate(distances) if 0 < d <= 6]
        risky.sort()
        print(f"\n    closest non-identical pairs ({len(risky)} within 6 bits):")
        seen = set()
        for dist, a, b in risky:
            if (b, a) in seen:
                continue
            seen.add((a, b))
            base_a, base_b = a.split("_")[0], b.split("_")[0]
            kind = "same card number" if base_a == base_b else "DIFFERENT cards"
            print(f"      {dist:>3}  {a:<16} vs {b:<16}  {kind}")
            if len(seen) >= 12:
                break

    # Same artwork, different printing: the closest offline proxy for a photograph.
    if len(per_lang) == 2:
        print("\n=== EN vs JP, same card number ===")
        (en_ids, en_bits), (jp_ids, jp_bits) = per_lang["en"], per_lang["jp"]
        jp_pos = {cid: i for i, cid in enumerate(jp_ids)}
        pairs = [(i, jp_pos[cid]) for i, cid in enumerate(en_ids) if cid in jp_pos]

        a = en_bits[[i for i, _ in pairs]]
        b = jp_bits[[j for _, j in pairs]]
        dist = (a * (1 - b) + (1 - a) * b).sum(axis=1).astype(np.int32)

        print(f"  {len(pairs)} card numbers present in both locales")
        print("  distance between the two printings of the same artwork:")
        for label, value in [
            ("min", dist.min()), ("median", np.median(dist)),
            ("p75", np.percentile(dist, 75)), ("p95", np.percentile(dist, 95)),
            ("max", dist.max()),
        ]:
            print(f"    {label:<7}{value:>7.1f}")
        print(f"    exactly equal: {int((dist == 0).sum())} "
              f"({(dist == 0).mean():.1%})")
        print("\n  Read this as a noise floor, not a target: the two files are clean "
              "renders of\n  the same art. A phone photo will drift considerably further.")

    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
