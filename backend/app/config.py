"""Filesystem layout for the backend.

Everything under DATA_DIR is gitignored: it is either downloaded (punk-records),
generated (the SQLite database) or third-party copyrighted material (card art).
"""

from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

DATA_DIR = BACKEND_DIR / "data"
PUNK_RECORDS_DIR = DATA_DIR / "punk-records"
IMAGE_CACHE_DIR = DATA_DIR / "images"
DB_PATH = DATA_DIR / "mytgc.db"

SCHEMA_PATH = BACKEND_DIR / "app" / "schema.sql"

# Internal language code -> punk-records folder name.
# Only these two are imported; punk-records also ships french, thai, chinese and
# english-asia, which are out of scope per PROJECT_CONTEXT.md section 1.
LANGUAGES = {
    "en": "english",
    "jp": "japanese",
}
