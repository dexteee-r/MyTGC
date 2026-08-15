"""Accounts, sessions and token rotation."""

from datetime import timedelta

import jwt
import pytest
from conftest import register

from app import auth


# --- registration ---------------------------------------------------------------

def test_register_returns_a_usable_session(client):
    account = register(client)
    assert account["user"]["email"] == "a@example.com"
    assert client.get("/auth/me", headers=account["headers"]).status_code == 200


def test_email_is_unique_case_insensitively(client):
    owner = register(client, email="Someone@Example.com")
    code = client.post("/auth/invites", json={}, headers=owner["headers"]).json()["code"]
    again = client.post(
        "/auth/register",
        json={"email": "someone@example.com", "password": "another-long-password",
              "invite_code": code},
    )
    assert again.status_code == 409


@pytest.mark.parametrize("password", ["short", "123456789"])
def test_short_passwords_are_refused(client, password):
    response = client.post(
        "/auth/register", json={"email": "b@example.com", "password": password}
    )
    assert response.status_code == 422


def test_password_is_not_stored_in_the_clear(client):
    from app import db

    account = register(client)
    connection = db.connect()
    stored = connection.execute(
        "SELECT password_hash FROM users WHERE id = ?", (account["user"]["id"],)
    ).fetchone()["password_hash"]
    connection.close()
    assert account["password"] not in stored
    assert stored.startswith("$argon2id$")


# --- login ----------------------------------------------------------------------

def test_login_succeeds_with_the_right_password(client):
    account = register(client)
    response = client.post(
        "/auth/login", json={"email": account["email"], "password": account["password"]}
    )
    assert response.status_code == 200
    assert response.json()["user"]["email"] == account["email"]


def test_wrong_password_and_unknown_email_are_indistinguishable(client):
    """Different messages would tell an attacker which addresses have accounts."""
    account = register(client)
    wrong_password = client.post(
        "/auth/login", json={"email": account["email"], "password": "not-the-password"}
    )
    unknown_email = client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": "whatever-long"}
    )
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


# --- access tokens --------------------------------------------------------------

def test_protected_endpoints_refuse_anonymous_callers(client):
    for path in ("/collection", "/collection/stats", "/cards", "/packs"):
        assert client.get(path).status_code == 401, path


def test_a_forged_token_is_refused(client):
    forged = jwt.encode({"sub": "1", "typ": "access"}, "not-the-key", algorithm="HS256")
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401


def test_an_expired_token_is_refused(client):
    account = register(client)
    expired = jwt.encode(
        {
            "sub": str(account["user"]["id"]),
            "typ": "access",
            "exp": auth.now() - timedelta(minutes=1),
        },
        auth.SECRET_KEY,
        algorithm="HS256",
    )
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401


def test_a_refresh_token_cannot_be_used_as_an_access_token(client):
    account = register(client)
    response = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {account['refresh']}"}
    )
    assert response.status_code == 401


# --- rotation -------------------------------------------------------------------

def test_refresh_rotates_the_token(client):
    account = register(client)
    response = client.post("/auth/refresh", json={"refresh_token": account["refresh"]})
    assert response.status_code == 200
    assert response.json()["refresh_token"] != account["refresh"]


def test_replaying_a_spent_token_revokes_the_whole_family(client):
    """Two parties holding one token means a copy is in circulation, so every
    session descended from that login is dropped rather than just the one."""
    account = register(client)
    rotated = client.post(
        "/auth/refresh", json={"refresh_token": account["refresh"]}
    ).json()["refresh_token"]

    replay = client.post("/auth/refresh", json={"refresh_token": account["refresh"]})
    assert replay.status_code == 401

    # The legitimate holder is signed out too: the family can no longer be trusted.
    assert client.post("/auth/refresh", json={"refresh_token": rotated}).status_code == 401


def test_logout_revokes_the_token(client):
    account = register(client)
    assert client.post("/auth/logout", json={"refresh_token": account["refresh"]}).status_code == 204
    assert client.post(
        "/auth/refresh", json={"refresh_token": account["refresh"]}
    ).status_code == 401


def test_refresh_without_any_token_is_refused(client):
    assert client.post("/auth/refresh", json={}).status_code == 401


# --- password change and deletion -----------------------------------------------

def test_changing_the_password_requires_the_current_one(client):
    account = register(client)
    response = client.post(
        "/auth/change-password",
        json={"current_password": "wrong-one-entirely", "new_password": "a-brand-new-password"},
        headers=account["headers"],
    )
    assert response.status_code == 401


def test_changing_the_password_signs_other_devices_out(client):
    account = register(client)
    assert client.post(
        "/auth/change-password",
        json={"current_password": account["password"], "new_password": "a-brand-new-password"},
        headers=account["headers"],
    ).status_code == 204

    assert client.post(
        "/auth/refresh", json={"refresh_token": account["refresh"]}
    ).status_code == 401
    assert client.post(
        "/auth/login", json={"email": account["email"], "password": "a-brand-new-password"}
    ).status_code == 200


def test_deleting_an_account_takes_its_collection_with_it(client):
    from app import db

    account = register(client)
    client.post(
        "/collection",
        json={"card_id": "OP01-001", "language": "en"},
        headers=account["headers"],
    )
    assert client.delete("/auth/me", headers=account["headers"]).status_code == 204

    connection = db.connect()
    remaining = connection.execute(
        "SELECT COUNT(*) FROM collection WHERE user_id = ?", (account["user"]["id"],)
    ).fetchone()[0]
    connection.close()
    assert remaining == 0
    assert client.get("/auth/me", headers=account["headers"]).status_code == 401


# Every table that holds something a person accumulated, checked in one place. The
# collection cascades from the users row; search_history has no foreign key to cascade
# from, so it has to be deleted by hand and this is what says so out loud. The legal
# page tells people deletion is total — it has to actually be.
def test_deleting_an_account_leaves_nothing_of_them_behind(client):
    from app import db

    account = register(client)
    headers = account["headers"]
    user_id = account["user"]["id"]

    client.post("/collection", json={"card_id": "OP01-001", "language": "en"},
                headers=headers)
    client.post("/wishlist", json={"card_id": "OP01-002", "language": "en"},
                headers=headers)
    client.post("/search-history", json={"query": "newgate"}, headers=headers)

    connection = db.connect()
    before = {
        table: connection.execute(
            f"SELECT COUNT(*) FROM {table} WHERE user_id = ?", (user_id,)
        ).fetchone()[0]
        for table in ("collection", "wishlist", "search_history", "refresh_tokens")
    }
    connection.close()
    # Guard against the test passing because nothing was ever written.
    assert all(count > 0 for count in before.values()), before

    assert client.delete("/auth/me", headers=headers).status_code == 204

    connection = db.connect()
    after = {
        table: connection.execute(
            f"SELECT COUNT(*) FROM {table} WHERE user_id = ?", (user_id,)
        ).fetchone()[0]
        for table in before
    }
    connection.close()
    assert after == {table: 0 for table in before}, after
