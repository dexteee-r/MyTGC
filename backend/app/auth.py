"""Accounts, sessions and token rotation.

Shape of the scheme, which follows the current consensus for an app that is both a
browser page and a native WebView:

  * passwords hashed with Argon2id, the algorithm's own parameters carried in the
    hash so they can be raised later without a migration
  * a short-lived access token (JWT, 15 minutes) sent as a Bearer header
  * a long-lived refresh token (30 days) that is *rotated* on every use

The refresh token is the sensitive one, so it is stored hashed and never in the
clear, and rotation makes theft detectable: presenting a token that has already been
exchanged means two parties hold it, so the entire family descended from that login
is revoked and both are forced to sign in again.

Transport differs by client, deliberately:
  * browsers get the refresh token in an httpOnly cookie, unreachable from JavaScript
    and therefore out of reach of an XSS
  * a Capacitor build cannot rely on that cookie — its origin is capacitor://localhost
    and iOS restricts cross-site cookies — so the token is also returned in the body
    for storage in Keychain/Keystore. It must not be put in localStorage.
"""

import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Cookie, Depends, Header, HTTPException, Request, Response

ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=30)
REFRESH_COOKIE = "mytcg_refresh"
ALGORITHM = "HS256"

# Sessions must survive a restart, so the signing key is read from the environment
# and only generated when absent — which is fine for a personal instance but logs a
# warning, because a generated key means every session dies on the next boot.
SECRET_KEY = os.environ.get("MYTCG_SECRET_KEY")
if not SECRET_KEY:
    SECRET_KEY = secrets.token_urlsafe(48)
    print("MYTCG_SECRET_KEY is not set: generated an ephemeral key. "
          "Every session will be invalidated when this process restarts.")

hasher = PasswordHasher()

# open   — anyone may sign up. Only sane on a private network.
# invite — a valid code is required. The default: the instance is publicly
#          reachable, and an account is what unlocks /scan, the one endpoint that
#          costs real CPU on a small box.
# closed — nobody may sign up; existing accounts keep working.
REGISTRATION_MODE = os.environ.get("MYTCG_REGISTRATION", "invite").strip().lower()
if REGISTRATION_MODE not in {"open", "invite", "closed"}:
    print(f"MYTCG_REGISTRATION={REGISTRATION_MODE!r} is not recognised; using 'invite'.")
    REGISTRATION_MODE = "invite"

INVITE_TTL = timedelta(days=14)


def now() -> datetime:
    return datetime.now(timezone.utc)


def stamp() -> str:
    """`now()`, formatted the way every timestamp column in this app is written and
    compared -- to the second, never finer. One function so a stray microsecond
    cannot creep into one column while the rest of the schema stays truncated."""
    return now().isoformat(timespec="seconds")


def hash_password(password: str) -> str:
    return hasher.hash(password)


def verify_password(stored_hash: str, password: str) -> bool:
    try:
        hasher.verify(stored_hash, password)
        return True
    except (VerifyMismatchError, InvalidHashError):
        return False


def needs_rehash(stored_hash: str) -> bool:
    return hasher.check_needs_rehash(stored_hash)


# --- tokens ---------------------------------------------------------------------

def create_access_token(user_id: int, email: str) -> str:
    issued = now()
    return jwt.encode(
        {
            "sub": str(user_id),
            "email": email,
            "iat": issued,
            "exp": issued + ACCESS_TTL,
            "typ": "access",
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "access token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "invalid access token")
    if payload.get("typ") != "access":
        raise HTTPException(401, "wrong token type")
    return payload


def _digest(token: str) -> str:
    # SHA-256 rather than Argon2: this value is high-entropy random already, so the
    # slow hashing that protects a guessable password buys nothing here and would
    # make every request expensive.
    return hashlib.sha256(token.encode()).hexdigest()


def issue_refresh_token(conn: sqlite3.Connection, user_id: int, family: str | None,
                        user_agent: str | None) -> str:
    token = secrets.token_urlsafe(48)
    conn.execute(
        "INSERT INTO refresh_tokens (user_id, token_hash, family, issued_at,"
        " expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, _digest(token), family or secrets.token_hex(16), stamp(),
         (now() + REFRESH_TTL).isoformat(timespec="seconds"), user_agent),
    )
    conn.commit()
    return token


def rotate_refresh_token(conn: sqlite3.Connection, token: str,
                         user_agent: str | None) -> tuple[int, str]:
    """Exchange a refresh token for a new one. Returns (user_id, new token)."""
    row = conn.execute(
        "SELECT * FROM refresh_tokens WHERE token_hash = ?", (_digest(token),)
    ).fetchone()
    if row is None:
        raise HTTPException(401, "unknown refresh token")

    if row["revoked_at"] is not None:
        # Already exchanged. Either a stolen copy or a client replaying an old
        # token; both mean the family can no longer be trusted.
        revoke_family(conn, row["family"])
        raise HTTPException(401, "refresh token reused; all sessions revoked")

    if datetime.fromisoformat(row["expires_at"]) < now():
        raise HTTPException(401, "refresh token expired")

    conn.execute("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?",
                 (stamp(), row["id"]))
    conn.commit()
    return row["user_id"], issue_refresh_token(conn, row["user_id"], row["family"],
                                               user_agent)


def revoke_token(conn: sqlite3.Connection, token: str) -> None:
    conn.execute(
        "UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?"
        " AND revoked_at IS NULL",
        (stamp(), _digest(token)),
    )
    conn.commit()


def revoke_family(conn: sqlite3.Connection, family: str) -> None:
    conn.execute(
        "UPDATE refresh_tokens SET revoked_at = ? WHERE family = ? AND revoked_at IS NULL",
        (stamp(), family),
    )
    conn.commit()


def revoke_all(conn: sqlite3.Connection, user_id: int) -> None:
    conn.execute(
        "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
        (stamp(), user_id),
    )
    conn.commit()


def list_sessions(conn: sqlite3.Connection, user_id: int) -> list[sqlite3.Row]:
    """One row per device currently signed in.

    Rotation revokes a family's previous token the moment it issues the next one
    (see rotate_refresh_token), so at most one row per family ever has
    revoked_at IS NULL -- this query returns exactly the still-active session of
    each device without needing to group by family itself.
    """
    return conn.execute(
        "SELECT * FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL"
        " AND expires_at > ? ORDER BY issued_at DESC",
        (user_id, stamp()),
    ).fetchall()


def revoke_session(conn: sqlite3.Connection, user_id: int, session_id: int) -> bool:
    """Ends one device's session. Scoped to user_id so one account can never
    revoke a row that belongs to another by guessing its id. Returns whether a
    row was actually revoked, so the caller can 404 on a no-op."""
    cursor = conn.execute(
        "UPDATE refresh_tokens SET revoked_at = ? WHERE id = ? AND user_id = ?"
        " AND revoked_at IS NULL",
        (stamp(), session_id, user_id),
    )
    conn.commit()
    return cursor.rowcount > 0


def token_matches(token: str | None, token_hash: str) -> bool:
    """Whether a plaintext token is the one behind a stored hash -- used to mark
    which row in list_sessions is the caller's own, from the refresh cookie it
    already carries alongside its access token."""
    return token is not None and _digest(token) == token_hash


# Scoped to "/" rather than "/auth". The client reaches the API through a proxy
# prefix (/api/auth/refresh in dev), so a cookie pinned to /auth is never sent and
# the session silently dies on every reload. Pinning it to the server's own path
# would tie the backend to whatever prefix a given client happens to mount it under.
COOKIE_PATH = "/"


def set_refresh_cookie(response: Response, token: str, secure: bool) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=int(REFRESH_TTL.total_seconds()),
        path=COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)


def read_refresh_token(body_token: str | None, cookie_token: str | None) -> str:
    """A native client sends the token in the body; a browser has it in the cookie."""
    token = body_token or cookie_token
    if not token:
        raise HTTPException(401, "no refresh token supplied")
    return token


# --- invitations ----------------------------------------------------------------

def create_invite(conn: sqlite3.Connection, created_by: int, note: str | None,
                  ttl: timedelta = INVITE_TTL) -> tuple[int, str]:
    """Mint a code, returning (row id, code).

    The id comes from the insert itself rather than a follow-up "latest row" query,
    which would hand back somebody else's invitation if two are minted at once.
    """
    code = secrets.token_urlsafe(9)
    cursor = conn.execute(
        "INSERT INTO invites (code_hash, note, created_by, created_at, expires_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (_digest(code), note, created_by, stamp(),
         (now() + ttl).isoformat(timespec="seconds")),
    )
    conn.commit()
    return cursor.lastrowid, code


def redeem_invite(conn: sqlite3.Connection, code: str) -> int:
    """Consume a code, returning its row id. Raises if it is not usable.

    Marking it used is conditional on it still being unused, so two people
    submitting the same code at the same moment cannot both get through.
    """
    row = conn.execute(
        "SELECT id, expires_at, used_at FROM invites WHERE code_hash = ?",
        (_digest(code.strip()),),
    ).fetchone()
    if row is None:
        raise HTTPException(403, "code d'invitation invalide")
    if row["used_at"] is not None:
        raise HTTPException(403, "ce code d'invitation a déjà été utilisé")
    if row["expires_at"] and datetime.fromisoformat(row["expires_at"]) < now():
        raise HTTPException(403, "ce code d'invitation a expiré")

    cursor = conn.execute(
        "UPDATE invites SET used_at = ? WHERE id = ? AND used_at IS NULL",
        (stamp(), row["id"]),
    )
    if cursor.rowcount == 0:
        raise HTTPException(403, "ce code d'invitation a déjà été utilisé")
    return row["id"]


def is_first_account(conn: sqlite3.Connection) -> bool:
    """Nobody can invite the very first person, so that one is always allowed."""
    return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0


# --- dependency -----------------------------------------------------------------

class CurrentUser:
    def __init__(self, row: sqlite3.Row):
        self.id: int = row["id"]
        self.email: str = row["email"]
        self.display_name: str | None = row["display_name"]


def bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "missing bearer token")
    return authorization.split(" ", 1)[1].strip()
