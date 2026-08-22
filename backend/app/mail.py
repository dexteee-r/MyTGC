"""Outbound email, for the one thing this app needs to send unprompted: a
password-reset link. Everything else (the invite code, a share link) is shown
directly in the app to someone already signed in.

Sent through Resend's HTTP API rather than SMTP -- `requests` is already a
dependency for the catalogue import, and a single POST avoids ever holding an SMTP
password or negotiating TLS by hand for the one email this app ever sends.
"""

import os

import requests

RESEND_API_KEY = os.environ.get("MYTCG_RESEND_API_KEY")
MAIL_FROM = os.environ.get("MYTCG_MAIL_FROM", "MyTCG <onboarding@resend.dev>")

RESEND_ENDPOINT = "https://api.resend.com/emails"


def send_password_reset_email(to_email: str, reset_url: str) -> None:
    """Best-effort: a mail provider outage must not turn into a 500 that tells an
    attacker an address exists (the caller always returns the same response either
    way), and there is nothing a person waiting on the email can do about a failed
    send except ask again later.

    Without an API key configured this only prints the link -- fine for a laptop
    running the dev server, where nobody is checking a real inbox anyway.
    """
    if not RESEND_API_KEY:
        print(f"MYTCG_RESEND_API_KEY is not set: would have emailed {to_email} "
              f"this link instead: {reset_url}")
        return

    try:
        response = requests.post(
            RESEND_ENDPOINT,
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json={
                "from": MAIL_FROM,
                "to": [to_email],
                "subject": "Réinitialise ton mot de passe MyTCG",
                "html": (
                    "<p>Une réinitialisation de mot de passe a été demandée pour "
                    "ce compte.</p>"
                    f'<p><a href="{reset_url}">Choisir un nouveau mot de passe</a></p>'
                    "<p>Ce lien expire dans une heure. Si tu n'es pas à l'origine "
                    "de cette demande, ignore simplement ce message.</p>"
                ),
            },
            timeout=10,
        )
        if not response.ok:
            print(f"Resend refused the password-reset email to {to_email}: "
                  f"{response.status_code} {response.text}")
    except requests.RequestException as error:
        print(f"Failed to send the password-reset email to {to_email}: {error}")
