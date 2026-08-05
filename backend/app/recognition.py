"""Match a card image against the precomputed catalogue hashes.

PROJECT_CONTEXT.md section 3, stage 1. Stage 2 (OCR of the printed code) only ever
runs to disambiguate what this returns, and stage 3 is manual search.

The separability measurement (scripts/analyze_separability.py) established that near
neighbours are almost never different cards — they are other printings of the same
card number, carrying the same artwork and the same printed code. So results are
grouped by card number: the group is the answer, the printings inside it are a
choice the user makes (or a detail that does not matter to them).
"""

from dataclasses import dataclass, field

import numpy as np

from app import hashing

# Distance beyond which no result is offered and the user is sent to manual search.
#
# Calibrated at the step-5 gate on 24 photographs of real cards
# (scripts/calibrate_threshold.py). The two populations separate cleanly:
#
#     correct identifications   distance 14-50
#     wrong identifications     distance 58-62
#
# Nothing lands in between, so 52 keeps every correct answer and rejects every wrong
# one. That is the point of the threshold: a miss that falls through to manual search
# costs seconds, while a miss presented confidently puts the wrong card in the
# collection silently. Re-run the calibration when the photo set grows.
DEFAULT_MAX_DISTANCE = 52

# A group is only reported as confident when the runner-up card number is clearly
# further away. Below this margin the answer is genuinely ambiguous and the UI should
# ask rather than assert.
CONFIDENT_MARGIN = 12


@dataclass
class Printing:
    card_id: str
    distance: int
    pack_code: str | None
    rarity: str | None


@dataclass
class Candidate:
    """One card number, with every printing of it that matched."""
    card_number: str
    language: str
    name: str
    distance: int                       # best distance across the printings
    printings: list[Printing] = field(default_factory=list)

    @property
    def ambiguous_printing(self) -> bool:
        """True when several printings tie, i.e. pHash cannot say which one it is."""
        return sum(p.distance == self.distance for p in self.printings) > 1


@dataclass
class Result:
    candidates: list[Candidate]
    margin: int | None                  # distance gap to the next card number

    @property
    def best(self) -> Candidate | None:
        return self.candidates[0] if self.candidates else None

    @property
    def confident(self) -> bool:
        return bool(self.candidates) and (self.margin is None
                                          or self.margin >= CONFIDENT_MARGIN)


class Catalogue:
    """In-memory view of the hashed catalogue.

    The whole thing is ~9,400 rows x 192 bits, well under a megabyte, so it is held
    as one float32 matrix and queried with a single matrix-vector product. Loading it
    per query would dominate the runtime; the FastAPI layer should build this once.
    """

    def __init__(self, conn, language: str | None = None):
        query = ("SELECT id, language, name, pack_code, rarity,"
                 " r_phash, g_phash, b_phash FROM cards WHERE r_phash IS NOT NULL")
        params: list = []
        if language:
            query += " AND language = ?"
            params.append(language)

        rows = conn.execute(query + " ORDER BY language, id", params).fetchall()
        if not rows:
            raise RuntimeError("no hashed cards; run compute_phashes.py first")

        self.rows = rows
        self.ids = [r["id"] for r in rows]
        self.card_numbers = [cid.split("_")[0] for cid in self.ids]

        packed = []
        for row in rows:
            value = 0
            for column in ("r_phash", "g_phash", "b_phash"):
                value = (value << hashing.HASH_BITS) | hashing.from_signed(row[column])
            packed.append(value.to_bytes(24, "big"))

        bits = np.unpackbits(np.frombuffer(b"".join(packed), dtype=np.uint8))
        self.bits = bits.reshape(len(rows), 192).astype(np.float32)
        self.inverse = 1.0 - self.bits

    def __len__(self) -> int:
        return len(self.ids)

    def distances(self, query: tuple[int, int, int]) -> np.ndarray:
        value = 0
        for channel in query:
            value = (value << hashing.HASH_BITS) | channel
        vector = np.unpackbits(
            np.frombuffer(value.to_bytes(24, "big"), dtype=np.uint8)
        ).astype(np.float32)
        # Hamming: bits differing in either direction.
        return (self.bits @ (1.0 - vector) + self.inverse @ vector).astype(np.int32)

    def identify(self, query: tuple[int, int, int], top: int = 5,
                 max_distance: int = DEFAULT_MAX_DISTANCE) -> Result:
        distances = self.distances(query)

        grouped: dict[tuple[str, str], Candidate] = {}
        for index in np.flatnonzero(distances <= max_distance):
            row = self.rows[index]
            key = (self.card_numbers[index], row["language"])
            distance = int(distances[index])

            candidate = grouped.get(key)
            if candidate is None:
                candidate = Candidate(
                    card_number=key[0], language=row["language"],
                    name=row["name"], distance=distance,
                )
                grouped[key] = candidate
            candidate.printings.append(
                Printing(row["id"], distance, row["pack_code"], row["rarity"])
            )
            if distance < candidate.distance:
                candidate.distance = distance
                candidate.name = row["name"]

        candidates = sorted(grouped.values(), key=lambda c: (c.distance, c.card_number))
        for candidate in candidates:
            candidate.printings.sort(key=lambda p: (p.distance, p.card_id))

        # The margin compares different card numbers, ignoring the same number in the
        # other locale: EN and JP printings of one card are not competing answers.
        margin = None
        if candidates:
            best_number = candidates[0].card_number
            runner_up = next(
                (c for c in candidates if c.card_number != best_number), None
            )
            if runner_up is not None:
                margin = runner_up.distance - candidates[0].distance

        return Result(candidates=candidates[:top], margin=margin)
