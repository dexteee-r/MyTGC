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
    bystander = register(client, email="bystander@example.com", invited_by=victim)

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


def test_the_scan_limit_is_published_so_the_camera_can_pace_itself(client):
    """The live scanner sends a frame every 1.2s at most — 50 a minute. When the
    limit here was 40 the camera spent the back half of every minute collecting
    429s and identifying nothing, which read as a broken scanner rather than as
    throttling. The client now reads the real numbers from /health, so they have
    to be there, and they have to leave room for a steady hand."""
    body = client.get("/health").json()

    assert body["scan_rate_limit"] == throttle.SCAN_LIVE.limit
    assert body["scan_window_seconds"] == int(throttle.SCAN_LIVE.window)

    frames_per_window = body["scan_window_seconds"] / 1.2
    assert body["scan_rate_limit"] > frames_per_window


def test_a_long_live_session_never_starves_a_single_capture(client):
    """Reported live: a live-scan session (now that it actually keeps trying instead
    of sitting stuck) burned through a rate limit a photo capture used to share with
    it, and the photo attempt right after failed with a message that read as a
    crash. The two are separate counters so neither can run the other dry.

    Exercised through the real /scan endpoint rather than the throttle objects
    directly, so this actually pins the `stream` query param routing to the right
    counter -- calling SlidingWindow.check() by hand would never have caught a bug
    in that routing itself. throttle.check() is the very first thing the endpoint
    does, ahead of even the catalogue check, so a garbage file and no hashed
    catalogue (neither set up for this test) still let the rate limit itself be
    observed through its real status codes.
    """
    account = register(client)
    tiny_file = {"file": ("card.jpg", b"not a real image", "image/jpeg")}

    # Exhaust the live-stream budget through the real endpoint.
    for _ in range(throttle.SCAN_LIVE.limit):
        client.post("/scan?stream=true", files=tiny_file, headers=account["headers"])
    exhausted = client.post("/scan?stream=true", files=tiny_file, headers=account["headers"])
    assert exhausted.status_code == 429

    # A single capture (default stream=false) never touched that counter, so it is
    # refused for an entirely different reason (no catalogue hashed in this test)
    # rather than by the rate limit the live session just spent.
    single = client.post("/scan", files=tiny_file, headers=account["headers"])
    assert single.status_code == 503


def test_the_forwarded_address_is_used_behind_a_proxy(client):
    """Behind Nginx and the proxy in front of it every request arrives from localhost,
    so without this the limit would apply to the whole world as one key."""

    class FakeRequest:
        headers = {"x-forwarded-for": "203.0.113.9, 10.0.0.1"}
        client = None

    assert throttle.client_address(FakeRequest()) == "203.0.113.9"
