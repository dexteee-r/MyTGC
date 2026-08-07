"""Registration policy.

The instance answers on a public address, and an account is what unlocks /scan —
the one endpoint that costs real CPU on a small host. Open sign-up would hand that
to anyone, so it is closed by default and these tests hold that shut.
"""

import pytest
from conftest import register

from app import auth, db


@pytest.fixture
def owner(client):
    """The first account, which is always allowed: nobody can invite it."""
    return register(client)


def invite(client, account, **body):
    response = client.post("/auth/invites", json=body or {}, headers=account["headers"])
    assert response.status_code == 201, response.text
    return response.json()


def signup(client, email, code=None):
    payload = {"email": email, "password": "a-long-enough-password"}
    if code is not None:
        payload["invite_code"] = code
    return client.post("/auth/register", json=payload)


# --- the default is invite-only --------------------------------------------------

def test_the_first_account_needs_no_invite(client):
    """There is nobody to issue one, so this must always work."""
    assert client.post(
        "/auth/register", json={"email": "first@example.com", "password": "a-long-password"}
    ).status_code == 201


def test_a_stranger_cannot_sign_up_once_an_account_exists(client, owner):
    response = signup(client, "stranger@example.com")
    assert response.status_code == 403


def test_an_invented_code_is_refused(client, owner):
    assert signup(client, "stranger@example.com", "not-a-real-code").status_code == 403


def test_a_valid_code_lets_someone_in(client, owner):
    code = invite(client, owner, note="un ami")["code"]
    assert signup(client, "friend@example.com", code).status_code == 201


def test_a_code_works_once(client, owner):
    code = invite(client, owner)["code"]
    assert signup(client, "first-friend@example.com", code).status_code == 201
    assert signup(client, "second-friend@example.com", code).status_code == 403


def test_an_expired_code_is_refused(client, owner):
    code = invite(client, owner, days_valid=1)["code"]
    connection = db.connect()
    connection.execute(
        "UPDATE invites SET expires_at = ?",
        ((auth.now() - auth.timedelta(days=1)).isoformat(timespec="seconds"),),
    )
    connection.commit()
    connection.close()
    assert signup(client, "late@example.com", code).status_code == 403


def test_the_code_is_stored_hashed(client, owner):
    """A leaked table must not mint accounts."""
    code = invite(client, owner)["code"]
    connection = db.connect()
    stored = connection.execute("SELECT code_hash FROM invites").fetchone()["code_hash"]
    connection.close()
    assert code not in stored


def test_a_used_invite_records_who_used_it(client, owner):
    code = invite(client, owner)["code"]
    signup(client, "friend@example.com", code)

    connection = db.connect()
    row = connection.execute("SELECT used_at, used_by FROM invites").fetchone()
    connection.close()
    assert row["used_at"] is not None
    assert row["used_by"] is not None


def test_minting_two_invites_returns_two_distinct_codes(client, owner):
    """The id comes from the insert, not from a 'latest row' query that would hand
    back somebody else's invitation under concurrency."""
    first, second = invite(client, owner), invite(client, owner)
    assert first["id"] != second["id"]
    assert first["code"] != second["code"]


def test_an_invite_can_be_revoked_before_use(client, owner):
    created = invite(client, owner)
    assert client.delete(
        f"/auth/invites/{created['id']}", headers=owner["headers"]
    ).status_code == 204
    assert signup(client, "friend@example.com", created["code"]).status_code == 403


def test_only_a_signed_in_account_can_mint(client, owner):
    assert client.post("/auth/invites", json={}).status_code == 401


def test_the_signup_screen_can_ask_what_is_required(client, owner):
    assert client.get("/auth/registration").json()["mode"] == "invite"


# --- the other two modes ---------------------------------------------------------

def test_open_mode_lets_anyone_in(client, owner, monkeypatch):
    monkeypatch.setattr(auth, "REGISTRATION_MODE", "open")
    assert signup(client, "anyone@example.com").status_code == 201


def test_closed_mode_refuses_even_a_valid_code(client, owner, monkeypatch):
    code = invite(client, owner)["code"]
    monkeypatch.setattr(auth, "REGISTRATION_MODE", "closed")
    assert signup(client, "friend@example.com", code).status_code == 403


def test_a_rejected_signup_does_not_burn_the_code(client, owner):
    """A single-use code must survive a mistyped or already-taken address."""
    code = invite(client, owner)["code"]
    assert signup(client, owner["email"], code).status_code == 409
    assert signup(client, "friend@example.com", code).status_code == 201
