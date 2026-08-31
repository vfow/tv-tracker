from __future__ import annotations

from datetime import timedelta
from importlib import import_module
from typing import Any, Callable

from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix


FlaskInstaller = Callable[[Flask], None]


def build_flask_application(
    import_name: str,
    *,
    secret_key: str,
    max_content_length: int,
    permanent_session_lifetime: timedelta,
    trust_proxy_headers: bool,
    prepare_schema: Callable[[], None],
    register_routes: FlaskInstaller,
    install_client_error_reporting: FlaskInstaller,
    install_static_asset_versioning: FlaskInstaller,
) -> Flask:
    """Construct the core Flask application behind a package-owned boundary.

    Composition stays dependency-injected so importing this module is side-effect
    free: database preparation, route registration, and infrastructure installers
    run only when the factory is explicitly called. The root ``app.py`` remains a
    compatibility surface while callers migrate to package-owned composition.
    """

    application = Flask(import_name)
    if trust_proxy_headers:
        application.wsgi_app = ProxyFix(
            application.wsgi_app,
            x_for=1,
            x_proto=1,
            x_host=1,
        )
    application.config.update(
        SECRET_KEY=secret_key,
        MAX_CONTENT_LENGTH=max_content_length,
        SESSION_COOKIE_NAME="tv_tracker_session",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SECURE=True,
        SESSION_COOKIE_SAMESITE="Lax",
        PERMANENT_SESSION_LIFETIME=permanent_session_lifetime,
    )

    prepare_schema()
    register_routes(application)
    install_client_error_reporting(application)
    install_static_asset_versioning(application)
    return application


def get_legacy_application(module_name: str = "app") -> Any:
    """Return the current Flask application through a package-owned seam.

    Phase 13 establishes the permanent import boundary without moving the legacy
    application in one risky rewrite. Phase 18 can migrate callers behind this
    function while the existing root ``app.py`` remains rollback-compatible.
    """

    module = import_module(module_name)
    application = getattr(module, "app", None)
    if application is None:
        raise RuntimeError(f"{module_name!r} does not expose a Flask application")
    return application
