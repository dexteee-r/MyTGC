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

# Ink and gold from the app's own "L'Horizon" palette (index.css), not chosen fresh
# for this one email -- so it reads as the same product rather than a generic
# password-reset template a library would have produced.
_INK = "#221c12"
_INK_FAINT = "#8a7a5c"
_PAPER = "#f3e6cb"
_SEA = "#06171d"
_GOLD_LIGHT = "#ffd27a"
_GOLD_DARK = "#c9922a"
_SANS = "'IBM Plex Sans', Arial, sans-serif"
_DISPLAY = "'Space Grotesk', Georgia, serif"


def _reset_email_html(reset_url: str) -> str:
    # Table-based layout with every rule inlined: the only way a transactional
    # email renders consistently across Gmail, Outlook and Apple Mail, none of
    # which reliably support a <style> block, flexbox, or CSS custom properties.
    # border-radius and the button's gradient degrade gracefully to square
    # corners and a flat gold fill on the clients that ignore them (old Outlook),
    # rather than breaking the layout.
    return f"""\
<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background-color:{_SEA};font-family:{_SANS};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0"
                 style="max-width:480px;background-color:{_PAPER};border-radius:16px;">
            <tr>
              <td style="padding:40px 40px 8px;text-align:center;">
                <p style="margin:0;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:{_INK_FAINT};">
                  Collection One Piece
                </p>
                <h1 style="margin:8px 0 0;font-family:{_DISPLAY};font-weight:700;font-size:28px;color:{_INK};">
                  MyTCG
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 0;">
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:{_INK};">
                  Une réinitialisation de mot de passe a été demandée pour ce compte.
                </p>
                <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:{_INK};">
                  Choisis un nouveau mot de passe en ouvrant le lien ci-dessous.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 0;" align="center">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td bgcolor="{_GOLD_DARK}"
                        style="border-radius:2px;background:linear-gradient(180deg,{_GOLD_LIGHT},{_GOLD_DARK});">
                      <a href="{reset_url}"
                         style="display:inline-block;padding:14px 32px;font-family:{_SANS};font-size:15px;font-weight:600;color:{_INK};text-decoration:none;">
                        Choisir un nouveau mot de passe
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 40px 0;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:{_INK_FAINT};">
                  Ce lien expire dans une heure. Si tu n'es pas à l'origine de cette
                  demande, ignore simplement ce message — ton mot de passe reste
                  inchangé.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="border-top:1px solid rgba(34,28,18,.14);font-size:0;line-height:0;">&nbsp;</td></tr>
                </table>
                <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:{_INK_FAINT};word-break:break-all;">
                  Le bouton ne fonctionne pas&nbsp;? Colle ce lien dans ton navigateur :<br>
                  <a href="{reset_url}" style="color:{_GOLD_DARK};">{reset_url}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def _reset_email_text(reset_url: str) -> str:
    # Sent alongside the HTML part (a multipart email), not as a fallback nobody
    # reads: a message with no text/plain part scores worse with several spam
    # filters, and some clients show it by default regardless of HTML support.
    return (
        "Une réinitialisation de mot de passe a été demandée pour ce compte MyTCG.\n\n"
        f"Choisis un nouveau mot de passe : {reset_url}\n\n"
        "Ce lien expire dans une heure. Si tu n'es pas à l'origine de cette demande, "
        "ignore simplement ce message — ton mot de passe reste inchangé.\n"
    )


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
                "html": _reset_email_html(reset_url),
                "text": _reset_email_text(reset_url),
            },
            timeout=10,
        )
        if not response.ok:
            print(f"Resend refused the password-reset email to {to_email}: "
                  f"{response.status_code} {response.text}")
    except requests.RequestException as error:
        print(f"Failed to send the password-reset email to {to_email}: {error}")
