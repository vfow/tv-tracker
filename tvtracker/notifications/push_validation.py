from __future__ import annotations

import base64
import re
from typing import Any, Callable
from urllib.parse import urlparse

from flask import Response, jsonify, request


_B64URL_RE = re.compile(r"^[A-Za-z0-9_-]+={0,2}$")
_VALIDATION_CODES = {
    "invalid VAPID subject": "invalid_subject",
    "VAPID crypto validation unavailable": "validation_unavailable",
    "invalid VAPID public key": "invalid_public_key",
    "invalid VAPID private key": "invalid_private_key",
    "invalid VAPID keypair": "invalid_keypair",
    "VAPID public/private keys do not match": "keypair_mismatch",
}
PUSH_USER_MESSAGES = {
    "unavailable": "Push notifications are temporarily unavailable.",
    "enable_failed": "TV Tracker couldn’t enable Push on this device. Try again later.",
    "blocked": "Push notifications are blocked in your browser settings.",
    "permission_denied": "Push permission wasn’t granted.",
}


def _decode_base64url(value: str) -> bytes:
    clean = str(value or "").strip()
    if not clean or not _B64URL_RE.fullmatch(clean):
        raise ValueError("invalid base64url value")
    padding = "=" * ((4 - len(clean) % 4) % 4)
    return base64.urlsafe_b64decode(clean + padding)


def _valid_vapid_subject(subject: str) -> bool:
    clean = str(subject or "").strip()
    if clean.startswith("mailto:"):
        address = clean[7:].strip()
        return bool(address and "@" in address and not any(char.isspace() for char in address))
    if clean.startswith("https://"):
        parsed = urlparse(clean)
        return parsed.scheme == "https" and bool(parsed.netloc)
    return False


def validate_vapid_configuration(public_key: str, private_key: str, subject: str) -> tuple[bool, str]:
    """Validate VAPID material without making Push a startup dependency."""
    if not _valid_vapid_subject(subject):
        return False, "invalid VAPID subject"

    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import ec
    except Exception:
        return False, "VAPID crypto validation unavailable"

    try:
        public_bytes = _decode_base64url(public_key)
        if len(public_bytes) != 65 or public_bytes[0] != 0x04:
            return False, "invalid VAPID public key"
        public = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), public_bytes)
    except Exception:
        return False, "invalid VAPID public key"

    clean_private = str(private_key or "").strip()
    try:
        if clean_private.startswith("-----BEGIN"):
            private = serialization.load_pem_private_key(clean_private.encode("utf-8"), password=None)
        else:
            private_bytes = _decode_base64url(clean_private)
            if len(private_bytes) == 32:
                private_value = int.from_bytes(private_bytes, "big")
                if private_value <= 0:
                    return False, "invalid VAPID private key"
                private = ec.derive_private_key(private_value, ec.SECP256R1())
            else:
                private = serialization.load_der_private_key(private_bytes, password=None)
    except Exception:
        return False, "invalid VAPID private key"

    if not isinstance(private, ec.EllipticCurvePrivateKey) or not isinstance(private.curve, ec.SECP256R1):
        return False, "invalid VAPID private key"

    try:
        derived_public = private.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
        configured_public = public.public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
    except Exception:
        return False, "invalid VAPID keypair"

    if derived_public != configured_public:
        return False, "VAPID public/private keys do not match"

    return True, ""


def _missing_configuration_code(config: dict[str, Any]) -> str:
    if not str(config.get("publicKey") or "").strip():
        return "missing_public_key"
    if not str(config.get("privateKey") or "").strip():
        return "missing_private_key"
    if not str(config.get("subject") or "").strip():
        return "missing_subject"
    return "missing_configuration"


def _validation_code(error: str) -> str:
    return _VALIDATION_CODES.get(str(error or ""), "invalid_configuration" if error else "")


def browser_push_config_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    """Return the minimal, non-technical Push capability contract for browsers."""
    source = payload if isinstance(payload, dict) else {}
    configured = bool(source.get("configured"))
    public_key = str(source.get("publicKey") or "").strip() if configured else ""
    return {
        "ok": bool(source.get("ok", True)),
        "configured": configured,
        "publicKey": public_key,
        "unavailable": not configured,
    }


def browser_push_enable_error() -> dict[str, Any]:
    """Return the generic server-side Push enable failure exposed to browsers."""
    return {
        "ok": False,
        "error": PUSH_USER_MESSAGES["enable_failed"],
        "code": "push_enable_failed",
    }


def _replace_json_body(response: Response, payload: dict[str, Any]) -> Response:
    """Replace only a response JSON body while retaining auth/security headers."""
    safe = jsonify(payload)
    response.set_data(safe.get_data())
    response.content_type = safe.content_type
    response.headers["Content-Length"] = str(len(response.get_data()))
    return response


def harden_push_config(final_notifications_module: Any) -> Callable[[], dict[str, Any]]:
    original = final_notifications_module.push_config

    if getattr(original, "_tvtracker_vapid_hardened", False):
        return original

    def validated_push_config() -> dict[str, Any]:
        config = dict(original())
        # Diagnostics remain available to server logging/admin inspection only.
        # They are deliberately stripped from the browser Push configuration API.
        config.setdefault("validationError", "")
        config.setdefault("validationCode", "")

        if not config.get("keysConfigured"):
            config["configured"] = False
            config["validationCode"] = _missing_configuration_code(config)
            return config

        valid, error = validate_vapid_configuration(
            str(config.get("publicKey") or ""),
            str(config.get("privateKey") or ""),
            str(config.get("subject") or ""),
        )
        config["validationError"] = error
        config["validationCode"] = _validation_code(error)
        config["configured"] = bool(valid and config.get("dependencyAvailable"))

        if valid and not config.get("dependencyAvailable"):
            config["validationCode"] = "dependency_unavailable"

        if not valid:
            # Never expose or attempt to use malformed key material downstream.
            config["publicKey"] = ""
            config["privateKey"] = ""

        return config

    validated_push_config._tvtracker_vapid_hardened = True  # type: ignore[attr-defined]
    final_notifications_module.push_config = validated_push_config
    return validated_push_config


def install_notification_polish(app: Any, final_notifications_module: Any) -> None:
    """Install server-side Push validation and browser-safe Push responses."""
    harden_push_config(final_notifications_module)

    @app.after_request
    def sanitize_push_api(response: Response) -> Response:
        # This hook is intentionally path-based rather than endpoint-wrapping.
        # WSGI installs this module before final Push routes are registered, so the
        # sanitizer must remain effective regardless of registration order.
        if request.path == "/api/push/config" and response.status_code < 400 and response.is_json:
            payload = response.get_json(silent=True)
            if isinstance(payload, dict):
                return _replace_json_body(response, browser_push_config_payload(payload))

        if request.path == "/api/push/subscribe" and response.status_code == 400 and response.is_json:
            payload = response.get_json(silent=True)
            if isinstance(payload, dict) and payload.get("ok") is False:
                return _replace_json_body(response, browser_push_enable_error())

        return response

    @app.after_request
    def inject_notification_polish_asset(response: Response) -> Response:
        if not request.path.startswith("/app") or response.mimetype != "text/html" or response.direct_passthrough:
            return response
        body = response.get_data(as_text=True)
        if "notifications-polish.js" not in body:
            body = body.replace(
                "</body>",
                '<script src="/static/js/notifications-polish.js"></script>\n</body>',
            )
            response.set_data(body)
            response.headers["Content-Length"] = str(len(response.get_data()))
        return response
