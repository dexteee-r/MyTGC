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
REFRESH_COOKIE = "mytgc_refresh"
ALGORITHM = "HS256"

# Sessions must survive a restart, so the signing key is read from the environment
# and only generated when absent — which is fine for a personal instance but logs a
# warning, because a generated key means every session dies on the next boot.
SECRET_KEY = os.environ.get("MYTGC_SECRET_KEY")
if not SECRET_KEY:
    SECRET_KEY = secrets.token_urlsafe(48)
    print("MYTGC_SECRET_KEY is not set: generated an ephemeral key. "
          "Every session will be invalidated when this process restarts.")

hasher = PasswordHasher()


def now() -> datetime:
    return datetime.now(timezone.utc)


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
        (user_id, _digest(token), family or secrets.token_hex(16),
         now().isoformat(timespec="seconds"),
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
                 (now().isoformat(timespec="seconds"), row["id"]))
    conn.commit()
    return row["user_id"], issue_refresh_token(conn, row["user_id"], row["family"],
                                               user_agent)


def revoke_token(conn: sqlite3.Connection, token: str) -> None:
    conn.execute(
        "UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?"
        " AND revoked_at IS NULL",
        (now().isoformat(timespec="seconds"), _digest(token)),
    )
    conn.commit()


def revoke_family(conn: sqlite3.Connection, family: str) -> None:
    conn.execute(
        "UPDATE refresh_tokens SET revoked_at = ? WHERE family = ? AND revoked_at IS NULL",
        (now().isoformat(timespec="seconds"), family),
    )
    conn.commit()


def revoke_all(conn: sqlite3.Connection, user_id: int) -> None:
    conn.execute(
        "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
        (now().isoformat(timespec="seconds"), user_id),
    )
    conn.commit()


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
