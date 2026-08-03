"""Download and cache every card image referenced by the catalogue.

Build step 3, first half. Kept separate from hashing on purpose: downloading 9,000+
images from Bandai's servers is the slow, rate-limited, please-do-it-once part, while
re-hashing from the local cache takes a couple of minutes. The step-5 calibration will
want to re-hash repeatedly; it must never re-download.

Images are cached under backend/data/images/<language>/<card_id>.png, which is
gitignored: the art is (c)Eiichiro Oda/Shueisha, Toei Animation and Bandai Namco, and
committing it would be redistribution (PROJECT_CONTEXT.md section 9).

Usage:
    py backend/scripts/download_images.py [--language en|jp] [--workers 8] [--retry-failed]
"""

import argparse
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from PIL import Image, UnidentifiedImageError
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db
from app.config import DATA_DIR, IMAGE_CACHE_DIR, LANGUAGES

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

# Identify the client honestly rather than impersonating a browser. A bare
# python-requests UA is refused by the CDN.
USER_AGENT = "MyTGC/0.1 (personal collection manager; +https://github.com/dexteee-r/MyTGC)"
TIMEOUT = 30
MIN_BYTES = 1024  # anything smaller is an error page, not a card


def build_session() -> requests.Session:
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    retry = Retry(
        total=4,
        backoff_factor=1.5,           # 0s, 1.5s, 3s, 6s between attempts
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]),
    )
    session.mount("https://", HTTPAdapter(max_retries=retry, pool_maxsize=32))
    return session


def is_cached(path: Path) -> bool:
    """A file counts as cached only if it decodes. A truncated download from an
    interrupted run must not be silently accepted as valid."""
    if not path.exists() or path.stat().st_size < MIN_BYTES:
        return False
    try:
        with Image.open(path) as img:
            img.verify()
        return True
    except (OSError, UnidentifiedImageError):
        return False


def fetch(session: requests.Session, card_id: str, lang: str, url: str,
          dest: Path) -> tuple[str, str, Path | None, str | None]:
    """Returns (card_id, language, path, error)."""
    try:
        response = session.get(url, timeout=TIMEOUT)
        response.raise_for_status()
        if len(response.content) < MIN_BYTES:
            return card_id, lang, None, f"suspiciously small ({len(response.content)} B)"

        # Write to a temporary name first so an interrupted run cannot leave a
        # half-written file that later looks cached.
        tmp = dest.with_suffix(".part")
        tmp.write_bytes(response.content)
        with Image.open(tmp) as img:
            img.verify()
        tmp.replace(dest)
        return card_id, lang, dest, None
    except Exception as exc:                                  # noqa: BLE001
        return card_id, lang, None, f"{type(exc).__name__}: {exc}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Cache card images locally.")
    parser.add_argument("--language", choices=sorted(LANGUAGES), help="limit to one locale")
    parser.add_argument("--workers", type=int, default=8,
                        help="parallel downloads (default 8; keep it modest, this is "
                             "Bandai's public site)")
    parser.add_argument("--retry-failed", action="store_true",
                        help="only attempt cards that have no cached image yet")
    parser.add_argument("--limit", type=int, help="stop after N downloads (smoke test)")
    args = parser.parse_args()

    conn = db.connect()
    languages = [args.language] if args.language else sorted(LANGUAGES)

    query = "SELECT id, language, img_url FROM cards WHERE img_url IS NOT NULL"
    params: list = []
    if args.language:
        query += " AND language = ?"
        params.append(args.language)
    rows = conn.execute(query + " ORDER BY language, id", params).fetchall()

    todo, already = [], 0
    for row in rows:
        dest = IMAGE_CACHE_DIR / row["language"] / f"{row['id']}.png"
        if is_cached(dest):
            already += 1
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        todo.append((row["id"], row["language"], row["img_url"], dest))

    if args.limit:
        todo = todo[:args.limit]

    print(f"Locales: {', '.join(languages)}")
    print(f"{len(rows)} cards | {already} already cached | {len(todo)} to download")
    if not todo:
        print("Nothing to do.")
        _sync_paths(conn)
        return 0

    session = build_session()
    done = failed = 0
    failures: list[tuple[str, str, str]] = []
    lock = threading.Lock()

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(fetch, session, cid, lang, url, dest)
                   for cid, lang, url, dest in todo]
        for future in as_completed(futures):
            card_id, lang, path, error = future.result()
            with lock:
                if error:
                    failed += 1
                    failures.append((card_id, lang, error))
                else:
                    done += 1
                if (done + failed) % 250 == 0 or (done + failed) == len(todo):
                    print(f"  {done + failed}/{len(todo)}  ok={done} failed={failed}")

    print(f"\nDownloaded {done}, failed {failed}")
    if failures:
        print("Failures (re-run with --retry-failed to attempt only these):")
        for card_id, lang, error in failures[:20]:
            print(f"  {lang} {card_id}: {error}")
        if len(failures) > 20:
            print(f"  ... and {len(failures) - 20} more")

    _sync_paths(conn)
    conn.close()
    return 1 if failed else 0


def _sync_paths(conn) -> None:
    """Record image_path for every card whose file is on disk.

    Stored relative to backend/data so the database stays portable between machines.
    """
    updates = []
    for row in conn.execute("SELECT id, language FROM cards"):
        path = IMAGE_CACHE_DIR / row["language"] / f"{row['id']}.png"
        if path.exists():
            updates.append((path.relative_to(DATA_DIR).as_posix(), row["id"], row["language"]))

    conn.executemany(
        "UPDATE cards SET image_path = ? WHERE id = ? AND language = ?", updates
    )
    conn.commit()
    print(f"image_path set on {len(updates)} rows")


if __name__ == "__main__":
    raise SystemExit(main())
