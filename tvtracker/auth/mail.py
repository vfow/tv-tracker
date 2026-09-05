from __future__ import annotations

import os
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr


class MailConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class MailConfig:
    host: str
    port: int
    security: str
    username: str
    password: str
    from_address: str
    from_name: str
    display_name: str

    @classmethod
    def from_environment(cls) -> "MailConfig":
        host = os.environ.get("MAIL_HOST", "").strip()
        security = os.environ.get("MAIL_SECURITY", "starttls").strip().lower()
        if security not in {"ssl", "starttls", "plain"}:
            raise MailConfigurationError(
                "MAIL_SECURITY must be ssl, starttls, or plain"
            )

        default_port = 465 if security == "ssl" else 587
        raw_port = os.environ.get("MAIL_PORT", str(default_port)).strip()
        try:
            port = int(raw_port)
        except ValueError as error:
            raise MailConfigurationError("MAIL_PORT must be an integer") from error
        if port <= 0 or port > 65535:
            raise MailConfigurationError("MAIL_PORT is outside the valid range")

        from_address = os.environ.get("MAIL_FROM_ADDRESS", "").strip()
        display_name = os.environ.get("APP_DISPLAY_NAME", "").strip() or "Your tracker"
        from_name = os.environ.get("MAIL_FROM_NAME", "").strip() or display_name
        username = os.environ.get("MAIL_USERNAME", "").strip()
        password = os.environ.get("MAIL_PASSWORD", "")

        if not host:
            raise MailConfigurationError("MAIL_HOST is not configured")
        if not from_address or "@" not in from_address:
            raise MailConfigurationError("MAIL_FROM_ADDRESS is not configured")
        if bool(username) != bool(password):
            raise MailConfigurationError(
                "MAIL_USERNAME and MAIL_PASSWORD must either both be set or both be empty"
            )

        return cls(
            host=host,
            port=port,
            security=security,
            username=username,
            password=password,
            from_address=from_address,
            from_name=from_name,
            display_name=display_name,
        )


def mail_is_configured() -> bool:
    try:
        MailConfig.from_environment()
    except MailConfigurationError:
        return False
    return True


def send_account_email(
    *,
    to_address: str,
    subject: str,
    text_body: str,
    config: MailConfig | None = None,
) -> None:
    resolved = config or MailConfig.from_environment()
    message = EmailMessage()
    message["To"] = str(to_address).strip()
    message["From"] = formataddr((resolved.from_name, resolved.from_address))
    message["Subject"] = subject
    message.set_content(text_body)

    context = ssl.create_default_context()
    if resolved.security == "ssl":
        smtp = smtplib.SMTP_SSL(
            resolved.host,
            resolved.port,
            timeout=15,
            context=context,
        )
    else:
        smtp = smtplib.SMTP(resolved.host, resolved.port, timeout=15)

    with smtp:
        smtp.ehlo()
        if resolved.security == "starttls":
            smtp.starttls(context=context)
            smtp.ehlo()
        if resolved.username:
            smtp.login(resolved.username, resolved.password)
        smtp.send_message(message)


def verification_email(*, to_address: str, verification_url: str) -> None:
    config = MailConfig.from_environment()
    send_account_email(
        to_address=to_address,
        subject=f"Verify your email for {config.display_name}",
        text_body=(
            f"Verify your email to finish setting up your {config.display_name} account.\n\n"
            f"{verification_url}\n\n"
            "This link expires in 24 hours. If you did not request this, you can ignore this email."
        ),
        config=config,
    )


def password_reset_email(*, to_address: str, reset_url: str) -> None:
    config = MailConfig.from_environment()
    send_account_email(
        to_address=to_address,
        subject=f"Reset your password for {config.display_name}",
        text_body=(
            f"Use the link below to reset your {config.display_name} password.\n\n"
            f"{reset_url}\n\n"
            "This link expires in 30 minutes and can only be used once. "
            "If you did not request this, you can ignore this email."
        ),
        config=config,
    )


def email_change_email(*, to_address: str, verification_url: str) -> None:
    config = MailConfig.from_environment()
    send_account_email(
        to_address=to_address,
        subject=f"Confirm your new email for {config.display_name}",
        text_body=(
            f"Confirm this address as the new email for your {config.display_name} account.\n\n"
            f"{verification_url}\n\n"
            "Your old email remains active until this link is used. The link expires in 24 hours."
        ),
        config=config,
    )
