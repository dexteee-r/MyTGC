"""MyTGC API.

Build step 6, minus /scan. PROJECT_CONTEXT.md section 7 gates backend and UI work on
the step-5 recognition measurement, and that gate still stands — but it guards the scan
pipeline, and nothing here depends on it. Catalogue browsing, search and collection
management work whether or not recognition does.

/scan is deliberately absent rather than stubbed: an endpoint that returns something
plausible would let a frontend be built against a pipeline nobody has measured, which
is exactly what the gate exists to prevent.

Run:
    .venv/Scripts/uvicorn --app-dir backend app.main:app --reload
"""

import sqlite3
from contextlib import asynccontextmanager
from datetime import date
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app import db
from app.config import IMAGE_CACHE_DIR
from app.models import (Card, CardPage, CollectionCreate, CollectionEntry,
                        CollectionStats, CollectionUpdate, Language, Pack)

CARD_COLUMNS = ("id, language, name, pack_id, pack_code, pack_name, rarity, category,"
                " colors, cost, power, counter, attributes, types, image_path")


@asynccontextmanager
async def lifespan(app: FastAPI):
    connection = db.connect()
    db.init_schema(connection)
    connection.close()
    yield


app = FastAPI(title="MyTGC", version="0.1.0", lifespan=lifespan)

# Single user, self-hosted behind a Cloudflare Tunnel. The Capacitor shell serves the
# frontend from a different origin, so it needs to be allowed explicitly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "capacitor://localhost",
                   "http://localhost"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    """One connection per request.

    A single shared connection cannot be used here: FastAPI runs synchronous routes
    in a worker thread pool, and SQLite refuses a connection created in another
    thread. Opening per request is cheap against a local file and avoids the lock
    juggling that check_same_thread=False would require.
    """
    connection = db.connect()
    try:
        yield connection
    finally:
        connection.close()


Conn = Annotated[sqlite3.Connection, Depends(get_db)]


# --- catalogue ------------------------------------------------------------------

@app.get("/cards", response_model=CardPage)
def search_cards(
    conn: Conn,
    q: str | None = Query(None, description="substring of the name or the card id"),
    language: Language | None = None,
    pack_code: str | None = None,
    rarity: str | None = None,
    category: str | None = None,
    color: str | None = Query(None, description="single colour, matched within the JSON array"),
    owned: bool | None = Query(None, description="restrict to cards in the collection"),
    offset: int = Query(0, ge=0),
    limit: int = Query(60, ge=1, le=200),
):
    where, params = ["1=1"], []
    if q:
        where.append("(name LIKE ? OR id LIKE ?)")
        params += [f"%{q}%", f"%{q}%"]
    for column, value in (("language", language), ("pack_code", pack_code),
                          ("rarity", rarity), ("category", category)):
        if value:
            where.append(f"{column} = ?")
            params.append(value)
    if color:
        # colors is a JSON array; match the quoted element to avoid 'Black' hitting
        # a hypothetical 'Blackish'.
        where.append("colors LIKE ?")
        params.append(f'%"{color}"%')
    if owned is not None:
        clause = "EXISTS" if owned else "NOT EXISTS"
        where.append(f"{clause} (SELECT 1 FROM collection c"
                     " WHERE c.card_id = cards.id AND c.language = cards.language)")

    clause = " AND ".join(where)
    total = conn.execute(f"SELECT COUNT(*) FROM cards WHERE {clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT {CARD_COLUMNS} FROM cards WHERE {clause}"
        " ORDER BY language, id LIMIT ? OFFSET ?", [*params, limit, offset],
    ).fetchall()

    return CardPage(items=[Card.from_row(r) for r in rows],
                    total=total, offset=offset, limit=limit)


@app.get("/cards/{card_id}", response_model=Card)
def get_card(conn: Conn, card_id: str, language: Language = "en"):
    row = conn.execute(
        f"SELECT {CARD_COLUMNS}, effect, trigger FROM cards"
        " WHERE id = ? AND language = ?", (card_id, language),
    ).fetchone()
    if row is None:
        raise HTTPException(404, f"{card_id} not found in {language}")

    card = Card.from_row(row)
    # Sibling printings: same number, same artwork, same printed code.
    number = card_id.split("_")[0]
    # ESCAPE is required: '_' is a single-character wildcard in LIKE, and SQLite has
    # no default escape character, so a bare backslash would be matched literally.
    card.printings = [
        r["id"] for r in conn.execute(
            "SELECT id FROM cards WHERE language = ?"
            " AND (id = ? OR id LIKE ? ESCAPE '\\') AND id != ? ORDER BY id",
            (language, number, f"{number}\\_%", card_id),
        )
    ]
    return card


@app.get("/packs", response_model=list[Pack])
def list_packs(conn: Conn, language: Language | None = None):
    where, params = ("WHERE language = ?", [language]) if language else ("", [])
    rows = conn.execute(
        f"""SELECT pack_id, language, pack_code, pack_name,
                   COUNT(*) AS card_count,
                   SUM(EXISTS (SELECT 1 FROM collection c
                               WHERE c.card_id = cards.id
                                 AND c.language = cards.language)) AS owned_count
            FROM cards {where}
            GROUP BY pack_id, language
            ORDER BY language, pack_code IS NULL, pack_code""", params,
    ).fetchall()
    return [Pack(**dict(r)) for r in rows]


@app.get("/images/{language}/{filename}")
def get_image(language: Language, filename: str):
    # Resolve and confine to the cache directory: a filename is user input and
    # '..' would otherwise walk out of it.
    path = (IMAGE_CACHE_DIR / language / filename).resolve()
    if not path.is_relative_to(IMAGE_CACHE_DIR.resolve()) or not path.is_file():
        raise HTTPException(404, "image not cached")
    return FileResponse(path, media_type="image/png")


# --- collection -----------------------------------------------------------------

def _card_for(conn: sqlite3.Connection, card_id: str, language: str) -> Card | None:
    """Look the card up separately rather than joining it onto the collection row.

    A `SELECT col.*, c.*` makes both tables contribute an `id` column, and sqlite3.Row
    resolves the name to the first one — so the card silently inherited the collection
    entry's integer id. Two queries are clearer than aliasing every column.
    """
    row = conn.execute(
        f"SELECT {CARD_COLUMNS} FROM cards WHERE id = ? AND language = ?",
        (card_id, language),
    ).fetchone()
    return Card.from_row(row) if row else None


@app.get("/collection", response_model=list[CollectionEntry])
def list_collection(conn: Conn, language: Language | None = None):
    where, params = ("WHERE language = ?", [language]) if language else ("", [])
    rows = conn.execute(
        f"SELECT * FROM collection {where} ORDER BY date_added DESC, id DESC", params,
    ).fetchall()
    return [
        CollectionEntry(**dict(row),
                        card=_card_for(conn, row["card_id"], row["language"]))
        for row in rows
    ]


@app.post("/collection", response_model=CollectionEntry, status_code=201)
def add_to_collection(conn: Conn, entry: CollectionCreate):
    exists = conn.execute(
        "SELECT 1 FROM cards WHERE id = ? AND language = ?",
        (entry.card_id, entry.language),
    ).fetchone()
    if not exists:
        raise HTTPException(404, f"{entry.card_id} not found in {entry.language}")

    cursor = conn.execute(
        "INSERT INTO collection (card_id, language, quantity, condition,"
        " date_added, acquisition_price) VALUES (?, ?, ?, ?, ?, ?)",
        (entry.card_id, entry.language, entry.quantity, entry.condition,
         date.today().isoformat(), entry.acquisition_price),
    )
    conn.commit()
    return _entry(conn, cursor.lastrowid)


@app.patch("/collection/{entry_id}", response_model=CollectionEntry)
def update_collection(conn: Conn, entry_id: int, patch: CollectionUpdate):
    current = conn.execute(
        "SELECT * FROM collection WHERE id = ?", (entry_id,)
    ).fetchone()
    if current is None:
        raise HTTPException(404, "entry not found")

    fields = patch.model_dump(exclude_unset=True)
    if fields.get("quantity") == 0:
        # Dropping to zero means the card left the collection; keeping a zero-quantity
        # row would make every count and filter lie.
        conn.execute("DELETE FROM collection WHERE id = ?", (entry_id,))
        conn.commit()
        raise HTTPException(204, "entry removed: quantity reached zero")

    if fields:
        assignments = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE collection SET {assignments} WHERE id = ?",
                     [*fields.values(), entry_id])
        conn.commit()
    return _entry(conn, entry_id)


@app.delete("/collection/{entry_id}", status_code=204)
def delete_from_collection(conn: Conn, entry_id: int):
    cursor = conn.execute("DELETE FROM collection WHERE id = ?", (entry_id,))
    conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(404, "entry not found")


@app.get("/collection/stats", response_model=CollectionStats)
def collection_stats(conn: Conn):
    row = conn.execute(
        "SELECT COUNT(*) AS distinct_cards, COALESCE(SUM(quantity), 0) AS total,"
        " COALESCE(SUM(acquisition_price * quantity), 0) AS spent FROM collection"
    ).fetchone()
    by_language = {
        r["language"]: r["n"] for r in conn.execute(
            "SELECT language, SUM(quantity) AS n FROM collection GROUP BY language")
    }
    by_rarity = {
        r["rarity"] or "unknown": r["n"] for r in conn.execute(
            "SELECT c.rarity AS rarity, SUM(col.quantity) AS n FROM collection col"
            " JOIN cards c ON c.id = col.card_id AND c.language = col.language"
            " GROUP BY c.rarity")
    }
    return CollectionStats(
        distinct_cards=row["distinct_cards"], total_quantity=row["total"],
        by_language=by_language, by_rarity=by_rarity,
        acquisition_total=round(row["spent"], 2),
    )


def _entry(conn: sqlite3.Connection, entry_id: int) -> CollectionEntry:
    row = conn.execute("SELECT * FROM collection WHERE id = ?", (entry_id,)).fetchone()
    return CollectionEntry(**dict(row),
                           card=_card_for(conn, row["card_id"], row["language"]))


@app.get("/health")
def health(conn: Conn):
    meta = {r["language"]: r["card_count"] for r in
            conn.execute("SELECT language, card_count FROM catalogue_meta")}
    hashed = conn.execute(
        "SELECT COUNT(*) FROM cards WHERE r_phash IS NOT NULL").fetchone()[0]
    return {"status": "ok", "catalogue": meta, "hashed_cards": hashed,
            "scan_enabled": False}
