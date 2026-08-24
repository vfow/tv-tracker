from __future__ import annotations

import json
import math
import re
from datetime import date, datetime
from typing import Any

DATE_ONLY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
STATE_KEY_RE = re.compile(r"^[A-Za-z0-9._:-]{1,80}$")
ALLOWED_STATE_KEYS = {
    "profile",
    "movies",
    "metadata_sync",
    "network_sync",
    "import_info",
    "provider_metadata",
}
MAX_JSON_DEPTH = 16
MAX_JSON_CONTAINER_ITEMS = 500000
MAX_JSON_STRING_CHARS = 12 * 1024 * 1024
MAX_IDENTIFIER_CHARS = 240
MAX_SHOWS_PER_SYNC = 5000
MAX_HISTORY_PER_SYNC = 100000
MAX_DELETES_PER_SYNC = 100000
MAX_HISTORY_ORDER = 500000
MAX_AVATAR_DATA_URL_CHARS = 3 * 1024 * 1024
MAX_HEADER_DATA_URL_CHARS = 5 * 1024 * 1024
ALLOWED_PROFILE_IMAGE_PREFIXES = {
    "data:image/png;base64",
    "data:image/jpeg;base64",
    "data:image/webp;base64",
}
BASE64_RE = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")


class BackupValidationError(ValueError):
    pass


class SyncValidationError(BackupValidationError):
    pass


def json_clone(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False, allow_nan=False))


def backup_int(
    value: Any,
    field: str,
    *,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    if isinstance(value, bool):
        raise BackupValidationError(f"{field} must be a number")
    if isinstance(value, int):
        number = value
    elif isinstance(value, str) and re.fullmatch(r"-?\d+", value.strip()):
        number = int(value.strip())
    else:
        raise BackupValidationError(f"{field} must be a number") from None
    if minimum is not None and number < minimum:
        raise BackupValidationError(f"{field} is outside the supported range")
    if maximum is not None and number > maximum:
        raise BackupValidationError(f"{field} is outside the supported range")
    return number


def validate_calendar_date(value: str, field: str) -> str:
    if not DATE_ONLY_RE.fullmatch(value):
        raise BackupValidationError(f"{field} must use YYYY-MM-DD")
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise BackupValidationError(f"{field} is not a real calendar date") from None
    if parsed.isoformat() != value:
        raise BackupValidationError(f"{field} is not a real calendar date")
    return value


def validate_timestamp(value: str, field: str) -> str:
    if len(value) > 100:
        raise BackupValidationError(f"{field} is too long")
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        datetime.fromisoformat(normalized)
    except ValueError:
        raise BackupValidationError(f"{field} is not a valid timestamp") from None
    return value


def validate_json_value(value: Any, field: str, *, depth: int = 0) -> None:
    if depth > MAX_JSON_DEPTH:
        raise BackupValidationError(f"{field} is nested too deeply")
    if value is None or isinstance(value, (str, bool, int)):
        if isinstance(value, str):
            if len(value) > MAX_JSON_STRING_CHARS:
                raise BackupValidationError(f"{field} contains an oversized string")
            if DATE_ONLY_RE.fullmatch(value):
                validate_calendar_date(value, field)
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise BackupValidationError(f"{field} contains an invalid number")
        return
    if isinstance(value, list):
        if len(value) > MAX_JSON_CONTAINER_ITEMS:
            raise BackupValidationError(f"{field} contains too many items")
        for index, item in enumerate(value):
            validate_json_value(item, f"{field}[{index}]", depth=depth + 1)
        return
    if isinstance(value, dict):
        if len(value) > MAX_JSON_CONTAINER_ITEMS:
            raise BackupValidationError(f"{field} contains too many fields")
        for raw_key, item in value.items():
            if not isinstance(raw_key, str) or not raw_key or len(raw_key) > 160:
                raise BackupValidationError(f"{field} contains an invalid field name")
            validate_json_value(item, f"{field}.{raw_key}", depth=depth + 1)
        return
    raise BackupValidationError(f"{field} contains an unsupported value")


def normalized_identifier(value: Any, field: str, *, maximum: int = MAX_IDENTIFIER_CHARS) -> str:
    if isinstance(value, (dict, list, bool)):
        raise BackupValidationError(f"{field} is invalid")
    identifier = str(value or "").strip()
    if not identifier or len(identifier) > maximum:
        raise BackupValidationError(f"{field} is invalid")
    return identifier
