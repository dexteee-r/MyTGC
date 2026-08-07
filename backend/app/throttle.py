"""Request throttling.

Two endpoints need it for different reasons.

`/auth/login` is the door: without a limit, a public address plus an unlimited
guess rate is a brute-force invitation, and Argon2id only makes each attempt slow,
not the total impossible. The limit is per email *and* per address, because either
one alone is trivially sidestepped — rotating addresses defeats a per-IP limit,
and a botnet spraying one password across many accounts defeats a per-email one.

`/scan` is the expensive one: detection, deskew and hashing on a full-resolution
frame, and the live scanner fires it repeatedly by design. The limit here is not
about attackers so much as about one client's stream not starving the box.

An in-process counter is the right size for a self-hosted single instance. It
resets on restart, which is acceptable: a restart is not an attack vector, and a
shared store would mean running Redis for a household of one.
"""

import os
import time
from collections import defaultdict, deque
from contextlib import contextmanager
from threading import BoundedSemaphore, Lock

from fastapi import HTTPException, Request


class SlidingWindow:
    def __init__(self, limit: int, window_seconds: float, message: str):
        self.limit = limit
        self.window = window_seconds
        self.message = message
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, *keys: str) -> None:
        """Raises 429 when any of the keys has exhausted its allowance."""
        now = time.monotonic()
        with self._lock:
            for key in keys:
                if not key:
                    continue
                hits = self._hits[key]
                while hits and now - hits[0] > self.window:
                    hits.popleft()
                if len(hits) >= self.limit:
                    retry_after = int(self.window - (now - hits[0])) + 1
                    raise HTTPException(
                        429, self.message, headers={"Retry-After": str(retry_after)}
                    )
            for key in keys:
                if key:
                    self._hits[key].append(now)

    def forget(self, *keys: str) -> None:
        """Drop a key's history — called after a success, so a legitimate person
        who mistyped twice is not left sitting out the window."""
        with self._lock:
            for key in keys:
                self._hits.pop(key, None)


LOGIN = SlidingWindow(
    limit=8,
    window_seconds=300,
    message="Trop de tentatives. Réessaie dans quelques minutes.",
)

REGISTER = SlidingWindow(
    limit=5,
    window_seconds=3600,
    message="Trop de comptes créés depuis cette adresse. Réessaie plus tard.",
)

# Sized above what the live scanner can physically produce. It used to be 40 while
# the camera could send 50 a minute, so a steady hand ran into a 429 after about
# forty seconds and the stream went quiet — the limit was throttling the feature it
# was meant to protect. The concurrency cap is what actually protects the box; this
# is only a ceiling on one client running away.
SCAN = SlidingWindow(
    limit=int(os.environ.get("MYTCG_SCAN_RATE_LIMIT", "90")),
    window_seconds=60,
    message="Trop de scans d'affilée. Laisse la caméra respirer un instant.",
)


# --- concurrency -----------------------------------------------------------------
# The per-user rate limit bounds how often one person scans; it does nothing about
# how many people scan at once. Detection, deskew and three perceptual hashes on a
# full frame is the heaviest thing this app does, and the host is a small low-power
# box — so the number of scans running at any instant is capped outright.
#
# Requests wait briefly rather than failing immediately: a live scanner sending a
# frame while another finishes should queue, not error. Past that, saying "busy" is
# more honest than letting a queue grow until everything times out.

MAX_CONCURRENT_SCANS = int(os.environ.get("MYTCG_MAX_CONCURRENT_SCANS", "2"))
SCAN_QUEUE_SECONDS = float(os.environ.get("MYTCG_SCAN_QUEUE_SECONDS", "6"))

_scan_slots = BoundedSemaphore(MAX_CONCURRENT_SCANS)


@contextmanager
def scan_slot():
    if not _scan_slots.acquire(timeout=SCAN_QUEUE_SECONDS):
        raise HTTPException(
            503,
            "Le serveur traite déjà plusieurs scans. Réessaie dans un instant.",
            headers={"Retry-After": "2"},
        )
    try:
        yield
    finally:
        _scan_slots.release()


def client_address(request: Request) -> str:
    """The address to rate-limit on.

    Behind Nginx and a Cloudflare Tunnel every request arrives from localhost, so
    the direct peer is useless and the forwarded header is what identifies the
    caller. Only the first entry is trusted, and only because the proxy in front is
    ours — a header from an untrusted hop must never be believed.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
