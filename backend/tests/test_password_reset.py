"""Forgotten-password flow.

Same shape as an invite (auth.create_invite/redeem_invite): a high-entropy token,
stored only as its hash, one-time, short-lived. The request endpoint never reveals
whether an email has an account -- the response is identical either way -- so the
email itself, captured here via monkeypatch rather than a real Resend call, is the
only place a test can see the token that would actually be mailed out.
"""

from conftest import register

from app import auth, db, mail, throttle


def request_reset(client, monkeypatch, email):
    """Requests a reset and returns the (email, reset_url) the app would have
    mailed out, or None if nothing was sent."""
    sent = []
    monkeypatch.setattr(mail, "send_password_reset_email",
                        lambda to, url: sent.append((to, url)))
    response = client.post("/auth/password-reset", json={"email": email})
    assert response.status_code == 202, response.text
    return sent[0] if sent else None


def token_from(reset_url: str) -> str:
    return reset_url.split("token=")[1]


def test_requesting_a_reset_for_an_unknown_email_still_returns_202(client, monkeypatch):
    """The response must not say whether the address has an account -- telling the
    two apart is exactly what would let this endpoint enumerate registered emails."""
    sent = request_reset(client, monkeypatch, "nobody@example.com")
    assert sent is None


def test_a_known_email_gets_a_working_link(client, monkeypatch):
    account = register(client)
    _, reset_url = request_reset(client, monkeypatch, account["email"])
    assert reset_url.startswith("http://localhost:5173/reset-password?token=")

    response = client.post(
        "/auth/password-reset/confirm",
        json={"token": token_from(reset_url), "new_password": "a-brand-new-password"},
    )
    assert response.status_code == 204, response.text

    assert client.post(
        "/auth/login", json={"email": account["email"], "password": "a-brand-new-password"}
    ).status_code == 200
    assert client.post(
        "/auth/login", json={"email": account["email"], "password": account["password"]}
    ).status_code == 401


def test_a_reset_link_works_once(client, monkeypatch):
    account = register(client)
    _, reset_url = request_reset(client, monkeypatch, account["email"])
    token = token_from(reset_url)

    first = client.post(
        "/auth/password-reset/confirm",
        json={"token": token, "new_password": "a-brand-new-password"},
    )
    assert first.status_code == 204

    second = client.post(
        "/auth/password-reset/confirm",
        json={"token": token, "new_password": "a-different-password-again"},
    )
    assert second.status_code == 403


def test_an_invented_token_is_refused(client):
    response = client.post(
        "/auth/password-reset/confirm",
        json={"token": "not-a-real-token", "new_password": "a-brand-new-password"},
    )
    assert response.status_code == 403


def test_an_expired_link_is_refused(client, monkeypatch):
    account = register(client)
    _, reset_url = request_reset(client, monkeypatch, account["email"])

    connection = db.connect()
    connection.execute(
        "UPDATE password_resets SET expires_at = ?",
        ((auth.now() - auth.timedelta(hours=1)).isoformat(timespec="seconds"),),
    )
    connection.commit()
    connection.close()

    response = client.post(
        "/auth/password-reset/confirm",
        json={"token": token_from(reset_url), "new_password": "a-brand-new-password"},
    )
    assert response.status_code == 403


def test_the_token_is_stored_hashed(client, monkeypatch):
    """A leaked table must not hand out access to an existing account."""
    account = register(client)
    _, reset_url = request_reset(client, monkeypatch, account["email"])
    token = token_from(reset_url)

    connection = db.connect()
    stored = connection.execute("SELECT token_hash FROM password_resets").fetchone()["token_hash"]
    connection.close()
    assert token not in stored


def test_confirming_a_reset_signs_other_devices_out(client, monkeypatch):
    """The exact reasoning change-password already applies: a reset is precisely
    the moment a stolen session, if one exists, should stop working."""
    account = register(client)
    _, reset_url = request_reset(client, monkeypatch, account["email"])

    assert client.post(
        "/auth/password-reset/confirm",
        json={"token": token_from(reset_url), "new_password": "a-brand-new-password"},
    ).status_code == 204

    assert client.post(
        "/auth/refresh", json={"refresh_token": account["refresh"]}
    ).status_code == 401


def test_the_request_endpoint_is_rate_limited(client, monkeypatch):
    monkeypatch.setattr(mail, "send_password_reset_email", lambda to, url: None)
    for _ in range(throttle.PASSWORD_RESET.limit):
        assert client.post(
            "/auth/password-reset", json={"email": "someone@example.com"}
        ).status_code == 202
    assert client.post(
        "/auth/password-reset", json={"email": "someone@example.com"}
    ).status_code == 429


def test_without_an_api_key_the_link_is_only_printed_not_sent(client, monkeypatch, capsys):
    """The dev-server fallback: no MYTCG_RESEND_API_KEY means no real send attempt,
    just the link on stdout, so the flow is exercisable without a Resend account."""
    monkeypatch.setattr(mail, "RESEND_API_KEY", None)
    account = register(client)
    assert client.post(
        "/auth/password-reset", json={"email": account["email"]}
    ).status_code == 202
    assert "reset-password?token=" in capsys.readouterr().out
