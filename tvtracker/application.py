from __future__ import annotations

from importlib import import_module
from typing import Any


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
