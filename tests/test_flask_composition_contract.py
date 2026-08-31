from __future__ import annotations

from datetime import timedelta
import unittest

from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix

from tvtracker.application import build_flask_application


class FlaskCompositionContractTests(unittest.TestCase):
    def test_factory_is_explicit_and_preserves_installer_order_and_config(self):
        calls: list[tuple[str, Flask | None]] = []

        def prepare_schema() -> None:
            calls.append(("schema", None))

        def installer(name: str):
            def install(application: Flask) -> None:
                calls.append((name, application))

            return install

        application = build_flask_application(
            "flask-composition-contract",
            secret_key="contract-secret",
            max_content_length=12345,
            permanent_session_lifetime=timedelta(days=7),
            trust_proxy_headers=True,
            prepare_schema=prepare_schema,
            register_routes=installer("routes"),
            install_client_error_reporting=installer("client-errors"),
            install_static_asset_versioning=installer("static-assets"),
        )

        self.assertIsInstance(application, Flask)
        self.assertIsInstance(application.wsgi_app, ProxyFix)
        self.assertEqual(
            [name for name, _application in calls],
            ["schema", "routes", "client-errors", "static-assets"],
        )
        for _name, installed_application in calls[1:]:
            self.assertIs(installed_application, application)
        self.assertEqual(application.config["SECRET_KEY"], "contract-secret")
        self.assertEqual(application.config["MAX_CONTENT_LENGTH"], 12345)
        self.assertEqual(application.config["SESSION_COOKIE_NAME"], "tv_tracker_session")
        self.assertTrue(application.config["SESSION_COOKIE_HTTPONLY"])
        self.assertTrue(application.config["SESSION_COOKIE_SECURE"])
        self.assertEqual(application.config["SESSION_COOKIE_SAMESITE"], "Lax")
        self.assertEqual(
            application.config["PERMANENT_SESSION_LIFETIME"],
            timedelta(days=7),
        )

    def test_proxy_wrapping_remains_opt_in(self):
        application = build_flask_application(
            "flask-composition-no-proxy",
            secret_key="contract-secret",
            max_content_length=1,
            permanent_session_lifetime=timedelta(days=1),
            trust_proxy_headers=False,
            prepare_schema=lambda: None,
            register_routes=lambda _application: None,
            install_client_error_reporting=lambda _application: None,
            install_static_asset_versioning=lambda _application: None,
        )

        self.assertNotIsInstance(application.wsgi_app, ProxyFix)


if __name__ == "__main__":
    unittest.main()
