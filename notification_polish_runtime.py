from __future__ import annotations

import base64
import re
from typing import Any, Callable
from urllib.parse import urlparse

from flask import Response, request


_B64URL_RE = re.compile(r"^[A-Za-z0-9_-]+={0,2}$")


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
    """Validate the configured VAPID keypair without making Push a startup dependency."""
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


def harden_push_config(final_notifications_module: Any) -> Callable[[], dict[str, Any]]:
    original = final_notifications_module.push_config

    if getattr(original, "_tvtracker_vapid_hardened", False):
        return original

    def validated_push_config() -> dict[str, Any]:
        config = dict(original())
        config.setdefault("validationError", "")

        if not config.get("keysConfigured"):
            config["configured"] = False
            return config

        valid, error = validate_vapid_configuration(
            str(config.get("publicKey") or ""),
            str(config.get("privateKey") or ""),
            str(config.get("subject") or ""),
        )
        config["validationError"] = error
        config["configured"] = bool(valid and config.get("dependencyAvailable"))

        if not valid:
            # Never expose or attempt to use malformed key material downstream.
            config["publicKey"] = ""
            config["privateKey"] = ""

        return config

    validated_push_config._tvtracker_vapid_hardened = True  # type: ignore[attr-defined]
    final_notifications_module.push_config = validated_push_config
    return validated_push_config


def install_notification_polish(app: Any, final_notifications_module: Any) -> None:
    """Install Push validation and load the browser polish layer after notifications-final.js."""
    harden_push_config(final_notifications_module)

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
