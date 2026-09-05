from __future__ import annotations

import os
import smtplib
import unittest
from unittest.mock import patch

from tvtracker.auth.mail import (
    MailConfig, MailConfigurationError, MailDeliveryError,
    public_app_url, send_account_email,
)


class Phase4MailTests(unittest.TestCase):
    def config(self, security="starttls", username="", password=""):
        return MailConfig("smtp.example.test", 465 if security == "ssl" else 587,
                          security, username, password, "noreply@example.test",
                          "Example", "Example")

    def test_invalid_public_origins_fail_closed(self):
        for origin in ("", "http://example.test", "https://user:password@example.test",
                       "https://example.test/path", "https://example.test?x=1",
                       "https://example.test#token", "https://example.test:bad",
                       "https://example.test\\@attacker.test"):
            with self.subTest(origin=origin), patch.dict(os.environ, {"APP_PUBLIC_URL": origin}):
                with self.assertRaises(MailConfigurationError):
                    public_app_url()

    def test_starttls_precedes_authentication_and_delivery(self):
        with patch("tvtracker.auth.mail.smtplib.SMTP") as smtp:
            send_account_email(to_address="recipient@example.test", subject="Verify",
                               text_body="Test link", config=self.config(username="mailer", password="test-password"))
        client = smtp.return_value
        self.assertEqual([call[0] for call in client.method_calls],
                         ["ehlo", "starttls", "ehlo", "login", "send_message"])
        message = client.send_message.call_args.args[0]
        self.assertEqual(message["To"], "recipient@example.test")
        self.assertIn("Test link", message.get_content())

    def test_alwaysdata_style_ssl_delivery_does_not_require_login(self):
        with patch("tvtracker.auth.mail.smtplib.SMTP_SSL") as smtp:
            send_account_email(to_address="recipient@example.test", subject="Verify",
                               text_body="Test link", config=self.config("ssl"))
        smtp.return_value.login.assert_not_called()
        smtp.return_value.starttls.assert_not_called()
        smtp.return_value.send_message.assert_called_once()
        self.assertIsNotNone(smtp.call_args.kwargs["context"])

    def test_delivery_errors_do_not_expose_smtp_details(self):
        with patch("tvtracker.auth.mail.smtplib.SMTP", side_effect=smtplib.SMTPException("private SMTP details")):
            with self.assertRaises(MailDeliveryError) as caught:
                send_account_email(to_address="recipient@example.test", subject="Verify",
                                   text_body="Test link", config=self.config())
        self.assertNotIn("private", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
