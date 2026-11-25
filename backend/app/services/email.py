"""Plain, reliable transactional email over SMTP.

Messages are sent after the response (FastAPI background tasks), so a
slow or failing mail server never blocks or breaks an order. Until
SMTP_HOST and EMAIL_FROM are set, messages are logged and skipped.
"""

import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from html import escape

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class Email:
    to: str
    subject: str
    lines: list[str]
    action_label: str | None = None
    action_url: str | None = None


def email_enabled() -> bool:
    return bool(settings.smtp_host and settings.email_from)


def _html(email: Email) -> str:
    paragraphs = "".join(
        f'<p style="margin:0 0 14px;line-height:1.55">{escape(line)}</p>' if line else ""
        for line in email.lines
    )
    button = ""
    if email.action_label and email.action_url:
        button = (
            f'<p style="margin:22px 0"><a href="{escape(email.action_url)}" '
            'style="background:#172b22;color:#ffffff;padding:12px 18px;border-radius:8px;'
            f'text-decoration:none;font-weight:600">{escape(email.action_label)}</a></p>'
        )
    return (
        '<div style="font-family:Helvetica,Arial,sans-serif;color:#172b22;max-width:560px;margin:0 auto;padding:24px">'
        '<p style="font-size:18px;font-weight:700;margin:0 0 20px">FieldBasket</p>'
        f"{paragraphs}{button}"
        '<p style="margin-top:28px;font-size:12px;color:#5f6d66">'
        "You are receiving this because you have a FieldBasket account.</p></div>"
    )


def send_email(email: Email) -> None:
    """Send one email. Never raises: failures are logged."""
    if not email.to:
        return
    if not email_enabled():
        logger.info("Email not configured; skipped %r to %s", email.subject, email.to)
        return

    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = email.to
    message["Subject"] = email.subject
    text = "\n\n".join(email.lines)
    if email.action_url:
        text += f"\n\n{email.action_label}: {email.action_url}"
    message.set_content(text)
    message.add_alternative(_html(email), subtype="html")

    try:
        if settings.smtp_port == 465:
            server: smtplib.SMTP = smtplib.SMTP_SSL(
                settings.smtp_host, settings.smtp_port, timeout=20, context=ssl.create_default_context()
            )
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
            if settings.smtp_use_tls:
                server.starttls(context=ssl.create_default_context())
        with server:
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
    except (smtplib.SMTPException, OSError):
        logger.exception("Could not send %r to %s", email.subject, email.to)


def send_all(emails: list[Email]) -> None:
    for email in emails:
        send_email(email)
