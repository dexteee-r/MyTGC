"""The password-reset email's actual content and send path.

test_password_reset.py monkeypatches send_password_reset_email wholesale, so it
never sees what would really be inside the message or how the Resend call is
built -- that is what this file covers instead.
"""

from app import mail


class FakeResponse:
    def __init__(self, ok=True, status_code=200, text=""):
        self.ok = ok
        self.status_code = status_code
        self.text = text


def test_the_reset_link_appears_in_both_the_html_and_text_bodies():
    url = "https://mytcg.example.com/reset-password?token=abc123"
    assert url in mail._reset_email_html(url)
    assert url in mail._reset_email_text(url)


def test_sending_posts_to_resend_with_the_configured_sender(monkeypatch):
    monkeypatch.setattr(mail, "RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr(mail, "MAIL_FROM", "MyTCG <noreply@example.com>")
    calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append({"url": url, "headers": headers, "json": json})
        return FakeResponse()

    monkeypatch.setattr(mail.requests, "post", fake_post)

    reset_url = "https://mytcg.example.com/reset-password?token=abc123"
    mail.send_password_reset_email("friend@example.com", reset_url)

    assert len(calls) == 1
    call = calls[0]
    assert call["url"] == mail.RESEND_ENDPOINT
    assert call["headers"]["Authorization"] == "Bearer re_test_key"
    assert call["json"]["from"] == "MyTCG <noreply@example.com>"
    assert call["json"]["to"] == ["friend@example.com"]
    assert reset_url in call["json"]["html"]
    assert reset_url in call["json"]["text"]


def test_without_an_api_key_nothing_is_posted(monkeypatch):
    monkeypatch.setattr(mail, "RESEND_API_KEY", None)
    calls = []
    monkeypatch.setattr(mail.requests, "post", lambda *a, **k: calls.append(1))
    mail.send_password_reset_email("friend@example.com", "https://x/reset-password?token=abc")
    assert calls == []


def test_a_refused_send_does_not_raise(monkeypatch, capsys):
    """A mail-provider outage or a bad request to Resend must not become a 500 to
    the caller -- the endpoint already treats a request for a real account and one
    for a non-existent address identically, and an exception here would break that."""
    monkeypatch.setattr(mail, "RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr(
        mail.requests, "post",
        lambda *a, **k: FakeResponse(ok=False, status_code=422, text="invalid from address"),
    )
    mail.send_password_reset_email("friend@example.com", "https://x/reset-password?token=abc")
    assert "422" in capsys.readouterr().out


def test_a_network_failure_does_not_raise(monkeypatch, capsys):
    import requests as requests_module

    def raise_connection_error(*args, **kwargs):
        raise requests_module.ConnectionError("boom")

    monkeypatch.setattr(mail, "RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr(mail.requests, "post", raise_connection_error)
    mail.send_password_reset_email("friend@example.com", "https://x/reset-password?token=abc")
    assert "boom" in capsys.readouterr().out
