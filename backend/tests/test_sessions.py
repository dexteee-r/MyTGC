"""Connected devices: /auth/sessions.

refresh_tokens.user_agent has been in the schema since sessions were built, never
read back by anything until now — this is that screen's backend.
"""

from conftest import register


def test_a_fresh_login_is_the_one_and_only_session(client):
    account = register(client)
    response = client.get("/auth/sessions", headers=account["headers"])
    assert response.status_code == 200
    sessions = response.json()
    assert len(sessions) == 1
    assert sessions[0]["current"] is True


def test_the_session_carries_its_user_agent(client):
    response = client.post(
        "/auth/register",
        json={"email": "ua@example.com", "password": "a-long-enough-password"},
        headers={"User-Agent": "Mozilla/5.0 (Test Device)"},
    )
    headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    sessions = client.get("/auth/sessions", headers=headers).json()
    assert sessions[0]["user_agent"] == "Mozilla/5.0 (Test Device)"


def test_a_second_device_signing_in_adds_a_second_session_not_a_replacement(client):
    account = register(client)
    client.post(
        "/auth/login",
        json={"email": account["email"], "password": account["password"]},
        headers={"User-Agent": "Second Device"},
    )
    sessions = client.get("/auth/sessions", headers=account["headers"]).json()
    assert len(sessions) == 2
    # The TestClient's cookie jar now holds the second login's cookie -- that one
    # reads as current, the first as not, regardless of which bearer token asks.
    assert sorted(s["current"] for s in sessions) == [False, True]


def test_revoking_a_session_signs_out_only_that_device(client):
    account = register(client)
    second = client.post(
        "/auth/login",
        json={"email": account["email"], "password": account["password"]},
        headers={"User-Agent": "Second Device"},
    ).json()

    sessions = client.get("/auth/sessions", headers=account["headers"]).json()
    first_session_id = next(s["id"] for s in sessions if not s["current"])

    assert client.delete(
        f"/auth/sessions/{first_session_id}", headers=account["headers"]
    ).status_code == 204

    # The revoked device can no longer refresh...
    assert client.post(
        "/auth/refresh", json={"refresh_token": account["refresh"]}
    ).status_code == 401
    # ...but the other one is untouched.
    assert client.post(
        "/auth/refresh", json={"refresh_token": second["refresh_token"]}
    ).status_code == 200


def test_revoking_an_unknown_session_is_refused(client):
    account = register(client)
    assert client.delete(
        "/auth/sessions/999999", headers=account["headers"]
    ).status_code == 404


def test_a_session_cannot_be_revoked_by_another_account(client):
    """Same guard as revoke_invite: a wrong id reads as not-found, never as
    someone else's row, so an id alone cannot be used to probe for sessions that
    belong to a different account."""
    alice = register(client, email="alice@example.com")
    bob = register(client, email="bob@example.com", invited_by=alice)

    alice_session_id = client.get("/auth/sessions", headers=alice["headers"]).json()[0]["id"]

    assert client.delete(
        f"/auth/sessions/{alice_session_id}", headers=bob["headers"]
    ).status_code == 404
    # Untouched: alice can still refresh.
    assert client.post(
        "/auth/refresh", json={"refresh_token": alice["refresh"]}
    ).status_code == 200


def test_sessions_are_private_to_the_account(client):
    alice = register(client, email="alice@example.com")
    bob = register(client, email="bob@example.com", invited_by=alice)

    bob_sessions = client.get("/auth/sessions", headers=bob["headers"]).json()
    assert len(bob_sessions) == 1

    alice_sessions = client.get("/auth/sessions", headers=alice["headers"]).json()
    assert len(alice_sessions) == 1
    assert alice_sessions[0]["id"] != bob_sessions[0]["id"]


def test_logging_out_removes_the_session_from_the_list(client):
    account = register(client)
    client.post("/auth/logout", json={"refresh_token": account["refresh"]})
    sessions = client.get("/auth/sessions", headers=account["headers"]).json()
    assert sessions == []
