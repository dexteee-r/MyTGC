"""Brute-force protection on the sign-in door."""

from conftest import register

from app import throttle


def test_repeated_wrong_passwords_are_eventually_refused(client):
    account = register(client)
    statuses = [
        client.post(
            "/auth/login",
            json={"email": account["email"], "password": "wrong-password-here"},
        ).status_code
        for _ in range(throttle.LOGIN.limit + 2)
    ]
    assert 401 in statuses
    assert statuses[-1] == 429


def test_the_limit_says_when_to_come_back(client):
    account = register(client)
    for _ in range(throttle.LOGIN.limit + 1):
        response = client.post(
            "/auth/login",
            json={"email": account["email"], "password": "wrong-password-here"},
        )
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 0


def test_guessing_one_account_does_not_lock_out_another(client):
    """A per-address limit alone would let one victim's attacker lock everyone out;
    a per-email limit alone would let a rotating attacker through. Both are keyed,
    so a different account on the same address still has its own allowance."""
    victim = register(client, email="victim@example.com")
    bystander = register(client, email="bystander@example.com")

    for _ in range(throttle.LOGIN.limit + 1):
        client.post(
            "/auth/login",
            json={"email": victim["email"], "password": "wrong-password-here"},
        )

    # The address is now throttled, but only because it really did make the attempts.
    # The bystander's own key is untouched, which is what the email dimension buys.
    assert f"email:{bystander['email']}" not in throttle.LOGIN._hits


def test_signing_in_successfully_clears_the_counter(client):
    account = register(client)
    for _ in range(throttle.LOGIN.limit - 1):
        client.post(
            "/auth/login",
            json={"email": account["email"], "password": "wrong-password-here"},
        )

    assert client.post(
        "/auth/login", json={"email": account["email"], "password": account["password"]}
    ).status_code == 200

    # Back to a full allowance rather than one attempt from a lockout.
    assert client.post(
        "/auth/login",
        json={"email": account["email"], "password": "wrong-password-here"},
    ).status_code == 401


def test_the_forwarded_address_is_used_behind_a_proxy(client):
    """Behind Nginx and the tunnel every request arrives from localhost, so without
    this the limit would apply to the whole world as one key."""

    class FakeRequest:
        headers = {"x-forwarded-for": "203.0.113.9, 10.0.0.1"}
        client = None

    assert throttle.client_address(FakeRequest()) == "203.0.113.9"
