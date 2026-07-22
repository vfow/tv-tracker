#!/usr/bin/env python3
from __future__ import annotations

import getpass
import os
import sys

import psycopg
from argon2 import PasswordHasher


def required_env(name: str, *, strip: bool = True) -> str:
    value = os.environ.get(name, "")
    if strip:
        value = value.strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def database_connection() -> psycopg.Connection:
    return psycopg.connect(
        host=required_env("DB_HOST"),
        port=int(os.environ.get("DB_PORT", "5432")),
        dbname=required_env("DB_NAME"),
        user=required_env("DB_USER"),
        password=required_env("DB_PASSWORD", strip=False),
        connect_timeout=10,
    )


def main() -> int:
    username = input("New admin username: ").strip()
    if not username:
        print("Username cannot be blank.", file=sys.stderr)
        return 2
    if len(username) > 80:
        print("Username is too long.", file=sys.stderr)
        return 2

    password = getpass.getpass("New admin password: ")
    confirmation = getpass.getpass("Repeat new password: ")
    if password != confirmation:
        print("Passwords do not match.", file=sys.stderr)
        return 2
    if len(password) < 8:
        print("Password must contain at least 8 characters.", file=sys.stderr)
        return 2

    password_hash = PasswordHasher().hash(password)

    with database_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE tv_tracker_admin
                SET username = %s,
                    password_hash = %s,
                    session_version = session_version + 1,
                    updated_at = NOW()
                WHERE singleton_id = 1
                """,
                (username, password_hash),
            )
            if cursor.rowcount != 1:
                raise RuntimeError(
                    "Admin account is not initialized. Start the Phase 4 app once first."
                )
        connection.commit()

    print("Admin account reset. Every existing browser session is now invalid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
