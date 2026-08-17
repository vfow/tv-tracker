from __future__ import annotations

import base64
import unittest

from flask import Flask, Response

from notification_polish_runtime import (
    harden_push_config,
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

    def test_hardened_push_config_hides_invalid_key_material(self) -> None:
        public_key, private_key = _vapid_pair(1)

        class Module:
            @staticmethod
            def push_config():
                return {
                    "configured": True,
                    "keysConfigured": True,
                    "dependencyAvailable": True,
                    "publicKey": public_key + "broghgf7",
                    "privateKey": private_key,
                    "subject": "mailto:push@example.com",
                }

        wrapped = harden_push_config(Module)
        config = wrapped()
        self.assertFalse(config["configured"])
        self.assertEqual(config["publicKey"], "")
        self.assertEqual(config["privateKey"], "")
        self.assertEqual(config["validationError"], "invalid VAPID public key")

    def test_polish_asset_is_injected_after_final_asset(self) -> None:
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

        # Registered after the polish hook so Flask's reverse after_request order
        # models final_notifications.install_final_notifications().
        @app.after_request
        def inject_final(response: Response) -> Response:
            if response.mimetype == "text/html":
                body = response.get_data(as_text=True).replace(
                    "</body>",
                    '<script src="/static/js/notifications-final.js"></script></body>',
                )
                response.set_data(body)
            return response

        @app.get("/app/test")
        def page() -> Response:
            return Response("<html><body>ok</body></html>", mimetype="text/html")

        response = app.test_client().get("/app/test")
        body = response.get_data(as_text=True)
        self.assertLess(body.index("notifications-final.js"), body.index("notifications-polish.js"))


if __name__ == "__main__":
    unittest.main()
