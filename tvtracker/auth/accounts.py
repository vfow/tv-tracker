from __future__ import annotations

import re
from uuid import UUID, uuid4


ACCOUNT_ROLES = frozenset({"user", "admin"})
ACCOUNT_STATUSES = frozenset(
    {"unverified", "active", "deactivated", "pending_deletion"}
)
USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,30}$")


def new_user_id() -> UUID:
    """Return a server-generated immutable account identifier."""

    return uuid4()


def normalize_email(value: str) -> str:
    return str(value).strip().lower()


def normalize_username(value: str) -> str:
    return str(value).strip().lower()


def validated_username(value: str) -> str:
    username = str(value).strip()
    if USERNAME_RE.fullmatch(username) is None:
        raise ValueError(
            "Username must be 3-30 characters using only letters, numbers, or underscore"
        )
    return username
