from __future__ import annotations

import base64
import os
import unittest
from unittest.mock import patch

from flask import Flask, Response

from tvtracker.notifications import push_and_movies as final
from tvtracker.notifications.push_validation import (
    install_notification_polish,
    validate_vapid_configuration,
)


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _vapid_pair(private_value: int = 1) -> tuple[str, str]:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    private = ec.derive_private_key(private_value, ec.SECP256R1())
    public_raw = private.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    private_raw = private_value.to_bytes(32, "big")
    return _b64url(public_raw), _b64url(private_raw)


class NotificationPolishRuntimeTests(unittest.TestCase):
    def test_valid_vapid_pair_and_subject_are_accepted(self) -> None:
        public_key, private_key = _vapid_pair(1)
        valid, error = validate_vapid_configuration(
            public_key,
            private_key,
            "mailto:push@example.com",
        )
        self.assertTrue(valid)
        self.assertEqual(error, "")

        valid_https, error_https = validate_vapid_configuration(
            public_key,
            private_key,
            "https://example.com",
        )
        self.assertTrue(valid_https)
        self.assertEqual(error_https, "")

    def test_appended_shell_text_invalidates_public_key(self) -> None:
        public_key, private_key = _vapid_pair(1)
        valid, error = validate_vapid_configuration(
            public_key + "broghgf7",
            private_key,
            "mailto:push@example.com",
        )
        self.assertFalse(valid)
        self.assertEqual(error, "invalid VAPID public key")

    def test_mismatched_vapid_pair_is_rejected(self) -> None:
        public_key, _ = _vapid_pair(1)
        _, other_private_key = _vapid_pair(2)
        valid, error = validate_vapid_configuration(
            public_key,
            other_private_key,
            "mailto:push@example.com",
        )
        self.assertFalse(valid)
        self.assertEqual(error, "VAPID public/private keys do not match")

    def test_invalid_subject_is_rejected(self) -> None:
        public_key, private_key = _vapid_pair(1)
        valid, error = validate_vapid_configuration(
            public_key,
            private_key,
            "tvtracker@example.com",
        )
        self.assertFalse(valid)
        self.assertEqual(error, "invalid VAPID subject")

    def test_push_config_hides_invalid_key_material(self) -> None:
        public_key, private_key = _vapid_pair(1)
        env = {
            "VAPID_PUBLIC_KEY": public_key + "broghgf7",
            "VAPID_PRIVATE_KEY": private_key,
            "VAPID_SUBJECT": "mailto:push@example.com",
        }
        with patch.dict(os.environ, env, clear=True), patch.object(
            final, "_pywebpush_available", return_value=True
        ):
            config = final.push_config()
        self.assertFalse(config["configured"])
        self.assertEqual(config["publicKey"], "")
        self.assertEqual(config["privateKey"], "")
        self.assertEqual(config["validationError"], "invalid VAPID public key")
        self.assertEqual(config["validationCode"], "invalid_public_key")

    def test_push_config_reports_missing_private_key_without_exposing_material(self) -> None:
        public_key, _ = _vapid_pair(1)
        env = {
            "VAPID_PUBLIC_KEY": public_key,
            "VAPID_PRIVATE_KEY": "",
            "VAPID_SUBJECT": "mailto:push@example.com",
        }
        with patch.dict(os.environ, env, clear=True), patch.object(
            final, "_pywebpush_available", return_value=True
        ):
            config = final.push_config()
        self.assertFalse(config["configured"])
        self.assertEqual(config["validationCode"], "missing_private_key")
        self.assertEqual(config["validationError"], "")

    def test_push_config_response_hides_mismatch_diagnostics(self) -> None:
        public_key, _ = _vapid_pair(1)
        _, other_private_key = _vapid_pair(2)
        env = {
            "VAPID_PUBLIC_KEY": public_key,
            "VAPID_PRIVATE_KEY": other_private_key,
            "VAPID_SUBJECT": "mailto:push@example.com",
        }

        app = Flask(__name__)
        install_notification_polish(app)

        @app.get("/api/push/config")
        def push_config_route():
            config = final.push_config()
            return {
                "ok": True,
                "configured": config["configured"],
                "publicKey": config["publicKey"] if config["configured"] else "",
                "dependencyAvailable": config["dependencyAvailable"],
            }

        with patch.dict(os.environ, env, clear=True), patch.object(
            final, "_pywebpush_available", return_value=True
        ):
            payload = app.test_client().get("/api/push/config").get_json()
        self.assertFalse(payload["configured"])
        self.assertEqual(payload["publicKey"], "")
        self.assertTrue(payload["unavailable"])
        self.assertNotIn("diagnostic", payload)
        self.assertNotIn("privateKey", payload)
        self.assertNotIn("validationError", payload)
        self.assertNotIn("validationCode", payload)
        self.assertNotIn("dependencyAvailable", payload)

    def test_valid_push_config_response_has_no_diagnostic(self) -> None:
        public_key, private_key = _vapid_pair(1)

        class Module:
            @staticmethod
            def push_config():
                return {
                    "configured": True,
                    "keysConfigured": True,
                    "dependencyAvailable": True,
                    "publicKey": public_key,
                    "privateKey": private_key,
                    "subject": "mailto:push@example.com",
                }

        app = Flask(__name__)
        install_notification_polish(app, Module)

        @app.get("/api/push/config")
        def push_config_route():
            config = Module.push_config()
            return {
                "ok": True,
                "configured": config["configured"],
                "publicKey": config["publicKey"] if config["configured"] else "",
                "dependencyAvailable": config["dependencyAvailable"],
            }

        payload = app.test_client().get("/api/push/config").get_json()
        self.assertTrue(payload["configured"])
        self.assertEqual(payload["publicKey"], public_key)
        self.assertNotIn("diagnostic", payload)

    def test_polish_does_not_inject_retired_browser_assets(self) -> None:
        public_key, private_key = _vapid_pair(1)

        class Module:
            @staticmethod
            def push_config():
                return {
                    "configured": True,
                    "keysConfigured": True,
                    "dependencyAvailable": True,
                    "publicKey": public_key,
                    "privateKey": private_key,
                    "subject": "mailto:push@example.com",
                }

        app = Flask(__name__)
        install_notification_polish(app, Module)

        @app.get("/app/test")
        def page() -> Response:
            return Response("<html><body>ok</body></html>", mimetype="text/html")

        body = app.test_client().get("/app/test").get_data(as_text=True)
        self.assertNotIn("notifications-final.js", body)
        self.assertNotIn("notifications-polish.js", body)
        self.assertEqual(body, "<html><body>ok</body></html>")


if __name__ == "__main__":
    unittest.main()
