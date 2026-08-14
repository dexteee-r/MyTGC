"""Filesystem layout for the backend.

Everything under DATA_DIR is gitignored: it is either downloaded (punk-records),
generated (the SQLite database) or third-party copyrighted material (card art).

The location is overridable through the environment. In production the data does
not belong inside a checkout — it is 2.5 GB of image cache plus the database, and
it has to survive a redeploy. The tests use it to run against a throwaway file
instead of the real collection.
"""

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

DATA_DIR = Path(os.environ.get("MYTCG_DATA_DIR") or BACKEND_DIR / "data")
PUNK_RECORDS_DIR = DATA_DIR / "punk-records"
IMAGE_CACHE_DIR = DATA_DIR / "images"

# Decor that ships with the deployment rather than with the source: the sign-in loop
# is a copyrighted clip, exactly like the card artwork next door, so it lives under
# backend/data -- which is gitignored -- and never enters a public repository.
MEDIA_DIR = IMAGE_CACHE_DIR.parent / "media"
DB_PATH = Path(os.environ.get("MYTCG_DB_PATH") or DATA_DIR / "mytcg.db")

SCHEMA_PATH = BACKEND_DIR / "app" / "schema.sql"

# Internal language code -> punk-records folder name.
# Only these two are imported; punk-records also ships french, thai, chinese and
# english-asia, which are out of scope per PROJECT_CONTEXT.md section 1.
LANGUAGES = {
    "en": "english",
    "jp": "japanese",
}
