from __future__ import annotations

import base64
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from tools.resolve_alwaysdata_db_env import (
    REQUIRED_DATABASE_ENV,
    DeploymentEnvironmentError,
    fetch_site_database_environment,
    parse_site_environment,
    write_github_environment,
)


class _FakeResponse:
    def __init__(self, payload: dict):
        self._data = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self, size: int = -1) -> bytes:
        if size < 0:
            return self._data
        return self._data[:size]


class DeploymentEnvironmentTests(unittest.TestCase):
    def site_environment(self, *, password: str = "db-password") -> str:
        return " ".join(
            [
                "SECRET_KEY=must-not-be-exported",
                "DB_HOST=db.example",
                "DB_PORT=5432",
                "DB_NAME=tvtracker",
                "DB_USER=tvtracker",
                f"DB_PASSWORD={password}",
                "TMDB_API_KEY=must-not-be-exported",
            ]
        )

    def test_parser_extracts_only_required_database_environment(self):
        values = parse_site_environment(self.site_environment())

        self.assertEqual(tuple(values), REQUIRED_DATABASE_ENV)
        self.assertEqual(values["DB_HOST"], "db.example")
        self.assertEqual(values["DB_PASSWORD"], "db-password")
        self.assertNotIn("SECRET_KEY", values)
        self.assertNotIn("TMDB_API_KEY", values)

    def test_parser_handles_quoted_values_without_shell_expansion(self):
        password = r'literal=$HOME;$(echo nope)=still-literal'
        serialized = self.site_environment(password=f'"{password}"')

        values = parse_site_environment(serialized)

        self.assertEqual(values["DB_PASSWORD"], password)

    def test_parser_rejects_missing_duplicate_and_empty_database_values(self):
        missing = self.site_environment().replace(" DB_PASSWORD=db-password", "")
        with self.assertRaisesRegex(DeploymentEnvironmentError, "DB_PASSWORD"):
            parse_site_environment(missing)

        duplicate = self.site_environment() + " DB_HOST=other.example"
        with self.assertRaisesRegex(DeploymentEnvironmentError, "Duplicate.*DB_HOST"):
            parse_site_environment(duplicate)

        empty = self.site_environment().replace("DB_PASSWORD=db-password", 'DB_PASSWORD=""')
        with self.assertRaisesRegex(DeploymentEnvironmentError, "empty.*DB_PASSWORD"):
            parse_site_environment(empty)

    def test_fetch_uses_official_site_api_and_rejects_wrong_target(self):
        payload = {
            "id": 123,
            "type": "wsgi",
            "environment": self.site_environment(),
        }

        with mock.patch(
            "tools.resolve_alwaysdata_db_env.urlopen",
            return_value=_FakeResponse(payload),
        ) as opener:
            values = fetch_site_database_environment(
                api_key="provider-token",
                account="example-account",
                site_id="123",
            )

        request = opener.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.alwaysdata.com/v1/site/123/")
        expected_basic = base64.b64encode(
            b"provider-token account=example-account:"
        ).decode("ascii")
        self.assertEqual(request.get_header("Authorization"), f"Basic {expected_basic}")
        self.assertEqual(values["DB_NAME"], "tvtracker")

        for wrong_payload in (
            {"id": 999, "type": "wsgi", "environment": self.site_environment()},
            {"id": 123, "type": "static", "environment": self.site_environment()},
        ):
            with self.subTest(payload=wrong_payload):
                with mock.patch(
                    "tools.resolve_alwaysdata_db_env.urlopen",
                    return_value=_FakeResponse(wrong_payload),
                ):
                    with self.assertRaises(DeploymentEnvironmentError):
                        fetch_site_database_environment(
                            api_key="provider-token",
                            account="example-account",
                            site_id="123",
                        )

    def test_github_environment_masks_values_and_writes_only_database_variables(self):
        values = parse_site_environment(self.site_environment(password="pa%ss=word"))
        with tempfile.TemporaryDirectory() as directory:
            github_env = Path(directory) / "github_env"
            with mock.patch("builtins.print") as output:
                write_github_environment(github_env, values)

            content = github_env.read_text(encoding="utf-8")

        self.assertIn("DB_PASSWORD=pa%ss=word\n", content)
        self.assertNotIn("SECRET_KEY", content)
        self.assertNotIn("TMDB_API_KEY", content)
        masked = [call.args[0] for call in output.call_args_list]
        self.assertIn("::add-mask::pa%25ss=word", masked)
        for name in REQUIRED_DATABASE_ENV:
            self.assertIn(f"{name}=", content)


if __name__ == "__main__":
    unittest.main()
