"""MyTCG API.

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

import os
import shutil
import sqlite3
import subprocess
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import Annotated

import cv2
import numpy as np
from fastapi import (Cookie, Depends, FastAPI, File, HTTPException, Query, Request,
                     Response, UploadFile)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image

from app import auth, db, detection, diagnosis, hashing, recognition, throttle
from app.config import BACKEND_DIR, IMAGE_CACHE_DIR, MEDIA_DIR
from app.models import (Card, CardPage, ChangePasswordRequest, CollectionCreate,
                        Invite, InviteCreate,
                        CollectionEntry, CollectionStats, CollectionUpdate, Language,
                        HistoryCreate, LoginRequest, Pack, ProfileUpdate,
                        RefreshRequest,
                        RegisterRequest, ScanCandidate, ScanPrinting, ScanResult, Session, UserProfile,
                        WishlistCreate, WishlistEntry, WishlistUpdate)

CARD_COLUMNS = ("id, language, name, pack_id, pack_code, pack_name, rarity, category,"
                " colors, cost, power, counter, attributes, types, image_path, release_date,"
                # The latest snapshot, carried on the card itself so every screen that
                # already shows a card -- the sheet, the want list, a scan result --
                # gets the figure without a second round trip. Correlated rather than
                # joined: price_history holds one row per card per day, and a join
                # would return the card once per day it has been priced.
                " (SELECT price FROM price_history h WHERE h.card_id = cards.id"
                "  AND h.language = cards.language"
                "  ORDER BY h.captured_at DESC, h.id DESC LIMIT 1) AS market_price")


def running_commit() -> str | None:
    """The commit actually serving requests.

    Without it, "is the deploy up to date?" can only be answered by guessing from
    which endpoints exist — which is how a silently stalled auto-deploy went
    unnoticed. Read once at startup; a restart is what a deploy ends with anyway.
    """
    if not shutil.which("git"):
        return None
    try:
        return subprocess.run(
            ["git", "-C", str(BACKEND_DIR.parent), "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=5, check=True,
        ).stdout.strip() or None
    except (subprocess.SubprocessError, OSError):
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.commit = running_commit()
    connection = db.connect()
    db.init_schema(connection)
    # The hashed catalogue is ~9,400 x 192 bits, well under a megabyte, so it is built
    # once and reused. Rebuilding it per scan would re-read every row and dominate the
    # request. It holds materialised rows and numpy arrays, no live connection.
    try:
        app.state.catalogue = recognition.Catalogue(connection)
    except RuntimeError:
        app.state.catalogue = None      # catalogue not hashed yet; /scan stays off
    connection.close()
    yield


app = FastAPI(title="MyTCG", version="0.1.0", lifespan=lifespan)

# capacitor:// and http://localhost are what the Android and iOS shells send as
# Origin; the Vite dev server is same-origin through its proxy but is listed for the
# case where VITE_API_BASE points straight at the API.
#
# The production host is not knowable at build time, so it comes from the
# environment: MYTCG_ORIGINS="https://cards.example.com". Credentials are allowed,
# which makes a wildcard both illegal and a bad idea.
ALLOWED_ORIGINS = [
    "http://localhost:5173", "https://localhost:5173",
    "capacitor://localhost", "http://localhost", "https://localhost",
    *[o.strip() for o in os.environ.get("MYTCG_ORIGINS", "").split(",") if o.strip()],
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
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


def current_user(
    conn: Conn,
    token: Annotated[str, Depends(auth.bearer_token)],
) -> auth.CurrentUser:
    payload = auth.decode_access_token(token)
    row = conn.execute("SELECT * FROM users WHERE id = ?", (payload["sub"],)).fetchone()
    if row is None:
        raise HTTPException(401, "account no longer exists")
    return auth.CurrentUser(row)


User = Annotated[auth.CurrentUser, Depends(current_user)]


# --- accounts -------------------------------------------------------------------

def _profile(row) -> UserProfile:
    # Rows written before the column existed read as NULL rather than as the default.
    return UserProfile(id=row["id"], email=row["email"],
                       display_name=row["display_name"], created_at=row["created_at"],
                       default_language=row["default_language"] or "en",
                       grid_columns=row["grid_columns"] or 2)


def _session(conn, response: Response, request: Request, row) -> Session:
    token = auth.issue_refresh_token(conn, row["id"], None,
                                     request.headers.get("user-agent"))
    auth.set_refresh_cookie(response, token, secure=request.url.scheme == "https")
    return Session(
        access_token=auth.create_access_token(row["id"], row["email"]),
        expires_in=int(auth.ACCESS_TTL.total_seconds()),
        refresh_token=token,
        user=_profile(row),
    )


@app.post("/auth/register", response_model=Session, status_code=201)
def register(conn: Conn, response: Response, request: Request, body: RegisterRequest):
    throttle.REGISTER.check(throttle.client_address(request))

    # Nobody can invite the first person, so that account is always allowed. After
    # that the configured policy applies.
    needs_invite = False
    if not auth.is_first_account(conn):
        if auth.REGISTRATION_MODE == "closed":
            raise HTTPException(403, "les inscriptions sont fermées")
        if auth.REGISTRATION_MODE == "invite":
            if not body.invite_code:
                raise HTTPException(403, "un code d'invitation est nécessaire")
            needs_invite = True

    email = body.email.strip()
    if conn.execute("SELECT 1 FROM users WHERE email_lower = ?",
                    (email.lower(),)).fetchone():
        raise HTTPException(409, "this email already has an account")

    # Redeemed only once everything else has passed. Consuming it first would mean a
    # mistyped or already-registered address burns a single-use code.
    invite_id = auth.redeem_invite(conn, body.invite_code) if needs_invite else None

    cursor = conn.execute(
        "INSERT INTO users (email, email_lower, display_name, password_hash, created_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (email, email.lower(), body.display_name or email.split("@")[0],
         auth.hash_password(body.password), auth.now().isoformat(timespec="seconds")),
    )
    if invite_id is not None:
        conn.execute("UPDATE invites SET used_by = ? WHERE id = ?",
                     (cursor.lastrowid, invite_id))
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return _session(conn, response, request, row)


@app.post("/auth/login", response_model=Session)
def login(conn: Conn, response: Response, request: Request, body: LoginRequest):
    # Limited by address and by email: either key alone is trivially sidestepped.
    email_key = body.email.strip().lower()
    address = throttle.client_address(request)
    throttle.LOGIN.check(address, f"email:{email_key}")

    row = conn.execute("SELECT * FROM users WHERE email_lower = ?",
                       (email_key,)).fetchone()

    # One message for both a wrong address and a wrong password: saying which was
    # wrong tells an attacker which addresses have accounts.
    if row is None or not auth.verify_password(row["password_hash"], body.password):
        raise HTTPException(401, "email ou mot de passe incorrect")

    # A successful sign-in clears the counter, so someone who mistyped twice is not
    # left sitting out the window.
    throttle.LOGIN.forget(address, f"email:{email_key}")

    if auth.needs_rehash(row["password_hash"]):
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                     (auth.hash_password(body.password), row["id"]))
    conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?",
                 (auth.now().isoformat(timespec="seconds"), row["id"]))
    conn.commit()
    return _session(conn, response, request, row)


@app.post("/auth/refresh", response_model=Session)
def refresh(conn: Conn, response: Response, request: Request,
            body: RefreshRequest | None = None,
            mytcg_refresh: Annotated[str | None, Cookie()] = None):
    token = auth.read_refresh_token(body.refresh_token if body else None, mytcg_refresh)
    user_id, rotated = auth.rotate_refresh_token(conn, token,
                                                 request.headers.get("user-agent"))
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(401, "account no longer exists")

    auth.set_refresh_cookie(response, rotated, secure=request.url.scheme == "https")
    return Session(
        access_token=auth.create_access_token(row["id"], row["email"]),
        expires_in=int(auth.ACCESS_TTL.total_seconds()),
        refresh_token=rotated,
        user=_profile(row),
    )


@app.post("/auth/logout", status_code=204)
def logout(conn: Conn, response: Response, body: RefreshRequest | None = None,
           mytcg_refresh: Annotated[str | None, Cookie()] = None):
    token = (body.refresh_token if body else None) or mytcg_refresh
    if token:
        auth.revoke_token(conn, token)
    auth.clear_refresh_cookie(response)


@app.get("/auth/registration")
def registration_policy(conn: Conn):
    """Lets the sign-up screen ask for a code only when one is actually needed."""
    return {
        "mode": "open" if auth.is_first_account(conn) else auth.REGISTRATION_MODE,
        "first_account": auth.is_first_account(conn),
    }


@app.post("/auth/invites", response_model=Invite, status_code=201)
def mint_invite(conn: Conn, user: User, body: InviteCreate):
    invite_id, code = auth.create_invite(
        conn, user.id, body.note, ttl=timedelta(days=body.days_valid)
    )
    row = conn.execute("SELECT * FROM invites WHERE id = ?", (invite_id,)).fetchone()
    # The code appears here and nowhere else: only its hash is stored.
    return Invite(id=row["id"], note=row["note"], created_at=row["created_at"],
                  expires_at=row["expires_at"], used_at=row["used_at"], code=code)


@app.get("/auth/invites", response_model=list[Invite])
def list_invites(conn: Conn, user: User):
    rows = conn.execute(
        "SELECT * FROM invites WHERE created_by = ? ORDER BY id DESC", (user.id,)
    ).fetchall()
    return [Invite(id=r["id"], note=r["note"], created_at=r["created_at"],
                   expires_at=r["expires_at"], used_at=r["used_at"]) for r in rows]


@app.delete("/auth/invites/{invite_id}", status_code=204)
def revoke_invite(conn: Conn, user: User, invite_id: int):
    cursor = conn.execute(
        "DELETE FROM invites WHERE id = ? AND created_by = ? AND used_at IS NULL",
        (invite_id, user.id),
    )
    conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(404, "invitation introuvable ou déjà utilisée")


@app.get("/auth/me", response_model=UserProfile)
def me(conn: Conn, user: User):
    return _profile(conn.execute("SELECT * FROM users WHERE id = ?", (user.id,)).fetchone())


@app.patch("/auth/me", response_model=UserProfile)
def update_profile(conn: Conn, user: User, patch: ProfileUpdate):
    fields = patch.model_dump(exclude_unset=True)
    if fields:
        assignments = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE users SET {assignments} WHERE id = ?",
                     [*fields.values(), user.id])
        conn.commit()
    return _profile(conn.execute("SELECT * FROM users WHERE id = ?", (user.id,)).fetchone())


@app.post("/auth/change-password", status_code=204)
def change_password(conn: Conn, user: User, body: ChangePasswordRequest):
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user.id,)).fetchone()
    if not auth.verify_password(row["password_hash"], body.current_password):
        raise HTTPException(401, "mot de passe actuel incorrect")

    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                 (auth.hash_password(body.new_password), user.id))
    conn.commit()
    # Changing a password is how someone reacts to a suspected compromise, so every
    # other session goes with it.
    auth.revoke_all(conn, user.id)


@app.delete("/auth/me", status_code=204)
def delete_account(conn: Conn, user: User, response: Response):
    # Collection, wishlist and sessions cascade from the account row.
    conn.execute("DELETE FROM users WHERE id = ?", (user.id,))
    conn.commit()
    auth.clear_refresh_cookie(response)


# --- catalogue ------------------------------------------------------------------

# pack_id was tried as a "most recent" proxy before release_date existed and it did
# not hold: it tracks order *within* a family, not across them. "set" is kept for
# people who think in set codes; "date" is the real chronological sort, backed by
# app/release_dates.py.
SORTS = {
    "code": "language, id",
    "set": "pack_code IS NULL, pack_code DESC, id",
    "name": "name COLLATE NOCASE, id",
    "date": "release_date IS NULL, release_date DESC, id",
}


@app.get("/cards", response_model=CardPage)
def search_cards(
    conn: Conn,
    user: User,
    q: str | None = Query(None, description="words matched against the name or the card id"),
    language: Language | None = None,
    pack_code: str | None = None,
    rarity: list[str] | None = Query(None, description="repeatable; any of them matches"),
    category: str | None = None,
    color: list[str] | None = Query(None, description="repeatable; any of them matches"),
    owned: bool | None = Query(None, description="restrict to cards in the collection"),
    sort: str = Query("code", description="code | set | name | date"),
    offset: int = Query(0, ge=0),
    limit: int = Query(60, ge=1, le=200),
):
    where, params = ["1=1"], []
    if q:
        # Every word has to appear, in the name or in the id, in any order: nobody
        # types "Ace &amp; Newgate" exactly, and a single LIKE over the whole string
        # fails on "newgate ace" and on the ampersand alike.
        for word in q.split():
            where.append("(name LIKE ? OR id LIKE ?)")
            params += [f"%{word}%", f"%{word}%"]
    for column, value in (("language", language), ("pack_code", pack_code),
                          ("category", category)):
        if value:
            where.append(f"{column} = ?")
            params.append(value)
    # Several rarities or several colours read as "any of these", the way a filter
    # panel reads: ticking Rare and SuperRare should widen the result, not empty it.
    if rarity:
        where.append(f"rarity IN ({', '.join('?' * len(rarity))})")
        params += rarity
    if color:
        # colors is a JSON array; match the quoted element to avoid 'Black' hitting
        # a hypothetical 'Blackish'.
        where.append("(" + " OR ".join("colors LIKE ?" for _ in color) + ")")
        params += [f'%"{c}"%' for c in color]
    if owned is not None:
        clause = "EXISTS" if owned else "NOT EXISTS"
        where.append(f"{clause} (SELECT 1 FROM collection c"
                     " WHERE c.card_id = cards.id AND c.language = cards.language"
                     " AND c.user_id = ?)")
        params.append(user.id)

    clause = " AND ".join(where)
    order = SORTS.get(sort, SORTS["code"])
    total = conn.execute(f"SELECT COUNT(*) FROM cards WHERE {clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT {CARD_COLUMNS} FROM cards WHERE {clause}"
        f" ORDER BY {order} LIMIT ? OFFSET ?", [*params, limit, offset],
    ).fetchall()

    return CardPage(items=[Card.from_row(r) for r in rows],
                    total=total, offset=offset, limit=limit)


@app.get("/cards/{card_id}", response_model=Card)
def get_card(conn: Conn, user: User, card_id: str, language: Language = "en"):
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
def list_packs(conn: Conn, user: User, language: Language | None = None):
    where, params = ("WHERE language = ?", [language]) if language else ("", [])
    params = [user.id, *params]
    rows = conn.execute(
        f"""SELECT pack_id, language, pack_code, pack_name,
                   COUNT(*) AS card_count,
                   SUM(EXISTS (SELECT 1 FROM collection c
                               WHERE c.card_id = cards.id
                                 AND c.language = cards.language
                                 AND c.user_id = ?)) AS owned_count
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


# Decor for the sign-in screen. Served rather than bundled for the same reason the
# card artwork is: it is copyrighted, backend/data is gitignored, and the repository
# is public. It therefore travels to the box by hand, not through a deploy.
#
# No authentication: this is the screen you look at *before* you have an account, so
# a guard here would mean the login page could never load its own background.
MEDIA_TYPES = {".mp4": "video/mp4", ".jpg": "image/jpeg", ".webm": "video/webm"}


@app.get("/media/{filename}")
def get_media(filename: str):
    path = (MEDIA_DIR / filename).resolve()
    if (not path.is_relative_to(MEDIA_DIR.resolve()) or not path.is_file()
            or path.suffix.lower() not in MEDIA_TYPES):
        raise HTTPException(404, "not found")
    # A range request is what lets a browser seek and loop a video without
    # re-downloading it; FileResponse handles the header on its own.
    return FileResponse(path, media_type=MEDIA_TYPES[path.suffix.lower()])


# --- scan -----------------------------------------------------------------------

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


@app.post("/scan", response_model=ScanResult)
async def scan(
    conn: Conn,
    user: User,
    request: Request,
    file: Annotated[UploadFile, File()],
    language: Language | None = Query(
        None,
        description="edition being scanned. The step-5 gate confirmed language cannot "
                    "be read from the artwork, so the client must say which it is; "
                    "omitting it searches both and may return the wrong edition.",
    ),
):
    throttle.SCAN.check(f"user:{user.id}")

    catalogue = app.state.catalogue
    if catalogue is None:
        raise HTTPException(503, "catalogue not hashed; run compute_phashes.py")

    payload = await file.read()
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "image too large")

    image = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(400, "could not decode the image")

    with throttle.scan_slot():
        rectified = detection.detect_and_deskew(image)
    if rectified is None:
        # Only on the empty path: a scan that worked pays nothing for this.
        return ScanResult(detected=False, confident=False,
                          reason=diagnosis.diagnose(image),
                          message="Aucune carte détectée. Cadre la carte entière sur "
                                  "un fond uni.")

    # Geometry cannot tell which way up the card was held, so both are hashed and the
    # closer one wins.
    best = None
    with throttle.scan_slot():
        for variant in detection.orientations(rectified):
            query = hashing.phash_rgb(
                hashing.crop_region(
                    Image.fromarray(cv2.cvtColor(variant, cv2.COLOR_BGR2RGB)), "art"))
            result = catalogue.identify(query, top=5)
            if result.best and (best is None
                                or result.best.distance < best.best.distance):
                best = result

    if best is None or not best.candidates:
        # The frame held a card and the catalogue does not know it: a set too new, a
        # promo, a foreign printing. Nothing about the photo needs fixing, so this is
        # never diagnosed as blur or glare.
        return ScanResult(detected=True, confident=False, reason="unknown",
                          message="Carte détectée mais non reconnue. Réessaie en "
                                  "cadrant mieux, ou passe par la recherche.")

    # Filter to the requested edition first, then judge confidence on what is left.
    # Judging it on the unfiltered list would mark a correct English answer as unsure
    # merely because the Japanese printing of the same artwork ranked above it.
    kept = [c for c in best.candidates if language is None or c.language == language]
    if not kept:
        return ScanResult(detected=True, confident=False, reason="unknown",
                          message="Aucune correspondance dans cette édition. Vérifie "
                                  "la langue sélectionnée.")

    runner_up = next((c for c in kept if c.card_number != kept[0].card_number), None)
    margin = None if runner_up is None else runner_up.distance - kept[0].distance
    confident = margin is None or margin >= recognition.CONFIDENT_MARGIN

    candidates = [
        ScanCandidate(
            card_number=c.card_number, language=c.language, name=c.name,
            distance=c.distance, ambiguous_printing=c.ambiguous_printing,
            printings=[ScanPrinting(card_id=p.card_id, distance=p.distance,
                                    pack_code=p.pack_code, rarity=p.rarity)
                       for p in c.printings],
            card=_card_for(conn, c.printings[0].card_id, c.language),
        )
        for c in kept
    ]
    return ScanResult(detected=True, confident=confident, margin=margin,
                      candidates=candidates)


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
def list_collection(conn: Conn, user: User, language: Language | None = None):
    where, params = "WHERE user_id = ?", [user.id]
    if language:
        where += " AND language = ?"
        params.append(language)
    rows = conn.execute(
        f"SELECT * FROM collection {where} ORDER BY date_added DESC, id DESC", params,
    ).fetchall()
    return [
        CollectionEntry(**dict(row),
                        card=_card_for(conn, row["card_id"], row["language"]))
        for row in rows
    ]


@app.post("/collection", response_model=CollectionEntry, status_code=201)
def add_to_collection(conn: Conn, user: User, entry: CollectionCreate):
    exists = conn.execute(
        "SELECT 1 FROM cards WHERE id = ? AND language = ?",
        (entry.card_id, entry.language),
    ).fetchone()
    if not exists:
        raise HTTPException(404, f"{entry.card_id} not found in {entry.language}")

    # Adding a card you already own increments that holding instead of creating a
    # second row: the collection screen listed the same card twice with separate
    # counts, which is not what "add this card" means.
    #
    # Condition is part of the key, though — a Near Mint and a Played copy of the
    # same card are genuinely different holdings and a collector prices them apart.
    existing = conn.execute(
        "SELECT id, quantity FROM collection"
        " WHERE user_id = ? AND card_id = ? AND language = ? AND condition IS ?",
        (user.id, entry.card_id, entry.language, entry.condition),
    ).fetchone()

    if existing:
        conn.execute("UPDATE collection SET quantity = ? WHERE id = ?",
                     (existing["quantity"] + entry.quantity, existing["id"]))
        conn.commit()
        return _entry(conn, existing["id"])

    cursor = conn.execute(
        "INSERT INTO collection (user_id, card_id, language, quantity, condition,"
        " date_added, acquisition_price) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user.id, entry.card_id, entry.language, entry.quantity, entry.condition,
         date.today().isoformat(), entry.acquisition_price),
    )
    conn.commit()
    return _entry(conn, cursor.lastrowid)


@app.patch("/collection/{entry_id}", response_model=CollectionEntry)
def update_collection(conn: Conn, user: User, entry_id: int, patch: CollectionUpdate):
    # Scoped by user_id, not just id: without it any signed-in account could edit
    # another's holdings by guessing a row number.
    current = conn.execute(
        "SELECT * FROM collection WHERE id = ? AND user_id = ?", (entry_id, user.id)
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
def delete_from_collection(conn: Conn, user: User, entry_id: int):
    cursor = conn.execute("DELETE FROM collection WHERE id = ? AND user_id = ?",
                          (entry_id, user.id))
    conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(404, "entry not found")


# --- search history -------------------------------------------------------------

HISTORY_KEPT = 8


@app.get("/search-history", response_model=list[str])
def list_history(conn: Conn, user: User):
    rows = conn.execute(
        "SELECT query FROM search_history WHERE user_id = ?"
        " ORDER BY searched_at DESC LIMIT ?", (user.id, HISTORY_KEPT),
    ).fetchall()
    return [r["query"] for r in rows]


@app.post("/search-history", response_model=list[str], status_code=201)
def add_history(conn: Conn, user: User, entry: HistoryCreate):
    query = entry.query.strip()
    if not query:
        return list_history(conn, user)
    conn.execute(
        "INSERT INTO search_history (user_id, query, searched_at) VALUES (?, ?, ?)"
        " ON CONFLICT (user_id, query) DO UPDATE SET searched_at = excluded.searched_at",
        (user.id, query, auth.now().isoformat()),
    )
    # Trimmed here rather than by a job: the list is short and this is the only place
    # it grows.
    conn.execute(
        "DELETE FROM search_history WHERE user_id = ? AND id NOT IN ("
        " SELECT id FROM search_history WHERE user_id = ?"
        " ORDER BY searched_at DESC LIMIT ?)", (user.id, user.id, HISTORY_KEPT),
    )
    conn.commit()
    return list_history(conn, user)


@app.delete("/search-history", status_code=204)
def clear_history(conn: Conn, user: User):
    conn.execute("DELETE FROM search_history WHERE user_id = ?", (user.id,))
    conn.commit()


# --- wishlist -------------------------------------------------------------------

def _wish(conn: sqlite3.Connection, entry_id: int) -> WishlistEntry:
    row = conn.execute("SELECT * FROM wishlist WHERE id = ?", (entry_id,)).fetchone()
    return WishlistEntry(**{k: row[k] for k in
                            ("id", "card_id", "language", "priority",
                             "alert_threshold", "notes")},
                         card=_card_for(conn, row["card_id"], row["language"]))


@app.get("/wishlist", response_model=list[WishlistEntry])
def list_wishlist(conn: Conn, user: User):
    rows = conn.execute(
        "SELECT * FROM wishlist WHERE user_id = ? ORDER BY priority, id DESC", (user.id,)
    ).fetchall()
    return [
        WishlistEntry(**{k: r[k] for k in ("id", "card_id", "language", "priority",
                                           "alert_threshold", "notes")},
                      card=_card_for(conn, r["card_id"], r["language"]))
        for r in rows
    ]


@app.post("/wishlist", response_model=WishlistEntry, status_code=201)
def add_to_wishlist(conn: Conn, user: User, entry: WishlistCreate):
    if not conn.execute("SELECT 1 FROM cards WHERE id = ? AND language = ?",
                        (entry.card_id, entry.language)).fetchone():
        raise HTTPException(404, f"{entry.card_id} not found in {entry.language}")

    # Wanting the same card twice is not a thing: adding again edits the entry
    # rather than stacking duplicates, which is what the collection does too.
    existing = conn.execute(
        "SELECT id FROM wishlist WHERE user_id = ? AND card_id = ? AND language = ?",
        (user.id, entry.card_id, entry.language),
    ).fetchone()
    if existing:
        conn.execute(
            "UPDATE wishlist SET priority = ?, alert_threshold = ?, price = ?,"
            " notes = ? WHERE id = ?",
            (entry.priority, entry.alert_threshold, entry.price, entry.notes,
             existing["id"]),
        )
        conn.commit()
        return _wish(conn, existing["id"])

    cursor = conn.execute(
        "INSERT INTO wishlist (user_id, card_id, language, priority, alert_threshold,"
        " price, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user.id, entry.card_id, entry.language, entry.priority,
         entry.alert_threshold, entry.price, entry.notes),
    )
    conn.commit()
    return _wish(conn, cursor.lastrowid)


@app.patch("/wishlist/{entry_id}", response_model=WishlistEntry)
def update_wishlist(conn: Conn, user: User, entry_id: int, patch: WishlistUpdate):
    if not conn.execute("SELECT 1 FROM wishlist WHERE id = ? AND user_id = ?",
                        (entry_id, user.id)).fetchone():
        raise HTTPException(404, "entry not found")

    fields = patch.model_dump(exclude_unset=True)
    if fields:
        assignments = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE wishlist SET {assignments} WHERE id = ?",
                     [*fields.values(), entry_id])
        conn.commit()
    return _wish(conn, entry_id)


@app.delete("/wishlist/{entry_id}", status_code=204)
def remove_from_wishlist(conn: Conn, user: User, entry_id: int):
    cursor = conn.execute("DELETE FROM wishlist WHERE id = ? AND user_id = ?",
                          (entry_id, user.id))
    conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(404, "entry not found")


@app.get("/collection/stats", response_model=CollectionStats)
def collection_stats(conn: Conn, user: User):
    row = conn.execute(
        "SELECT COUNT(*) AS distinct_cards, COALESCE(SUM(quantity), 0) AS total,"
        " COALESCE(SUM(acquisition_price * quantity), 0) AS spent FROM collection"
        " WHERE user_id = ?", (user.id,)
    ).fetchone()
    by_language = {
        r["language"]: r["n"] for r in conn.execute(
            "SELECT language, SUM(quantity) AS n FROM collection WHERE user_id = ?"
            " GROUP BY language", (user.id,))
    }
    by_rarity = {
        r["rarity"] or "unknown": r["n"] for r in conn.execute(
            "SELECT c.rarity AS rarity, SUM(col.quantity) AS n FROM collection col"
            " JOIN cards c ON c.id = col.card_id AND c.language = col.language"
            " WHERE col.user_id = ? GROUP BY c.rarity", (user.id,))
    }
    # The latest reading per card, not every reading: price_history keeps a row per
    # snapshot so a chart can be drawn later, and summing it raw would multiply the
    # collection by the number of days the importer has run.
    value = conn.execute(
        """SELECT COALESCE(SUM(latest.price * col.quantity), 0) AS worth,
                  COALESCE(SUM(col.quantity), 0) AS priced
             FROM collection col
             JOIN (SELECT card_id, language, price,
                          ROW_NUMBER() OVER (PARTITION BY card_id, language
                                             ORDER BY captured_at DESC, id DESC) AS rank
                     FROM price_history) latest
               ON latest.card_id = col.card_id AND latest.language = col.language
              AND latest.rank = 1
            WHERE col.user_id = ?""", (user.id,)
    ).fetchone()

    return CollectionStats(
        distinct_cards=row["distinct_cards"], total_quantity=row["total"],
        by_language=by_language, by_rarity=by_rarity,
        acquisition_total=round(row["spent"], 2),
        market_total=round(value["worth"], 2), market_priced=value["priced"],
    )


def _entry(conn: sqlite3.Connection, entry_id: int) -> CollectionEntry:
    row = conn.execute("SELECT * FROM collection WHERE id = ?", (entry_id,)).fetchone()
    # Callers have already checked ownership; this only shapes the response.
    return CollectionEntry(**dict(row),
                           card=_card_for(conn, row["card_id"], row["language"]))


@app.get("/health")
def health(conn: Conn):
    meta = {r["language"]: r["card_count"] for r in
            conn.execute("SELECT language, card_count FROM catalogue_meta")}
    hashed = conn.execute(
        "SELECT COUNT(*) FROM cards WHERE r_phash IS NOT NULL").fetchone()[0]
    return {"status": "ok", "commit": app.state.commit,
            "catalogue": meta, "hashed_cards": hashed,
            "registration": auth.REGISTRATION_MODE,
            # Published so the live scanner paces itself from the real limit rather
            # than a constant of its own that can quietly drift out of step.
            "scan_rate_limit": throttle.SCAN.limit,
            "scan_window_seconds": int(throttle.SCAN.window),
            "scan_enabled": app.state.catalogue is not None,
            "scan_threshold": recognition.DEFAULT_MAX_DISTANCE}
