import os
import unittest
from unittest.mock import MagicMock, patch
import sys
import types

try:
    import psycopg  # noqa: F401
except ModuleNotFoundError:
    psycopg_stub = types.ModuleType("psycopg")
    psycopg_stub.connect = lambda *args, **kwargs: None
    types_stub = types.ModuleType("psycopg.types")
    json_stub = types.ModuleType("psycopg.types.json")

    class Jsonb:
        def __init__(self, value):
            self.value = value

    json_stub.Jsonb = Jsonb
    sys.modules["psycopg"] = psycopg_stub
    sys.modules["psycopg.types"] = types_stub
    sys.modules["psycopg.types.json"] = json_stub



try:
    import flask  # noqa: F401
except ModuleNotFoundError as error:
    raise unittest.SkipTest("Flask is not installed in this test environment") from error

os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("DB_HOST", "test-db")
os.environ.setdefault("DB_NAME", "test-db")
os.environ.setdefault("DB_USER", "test-user")
os.environ.setdefault("DB_PASSWORD", "test-password")

# app.py creates its production Flask application at import time. Replace only
# the startup database connection so the regression suite remains hermetic and
# never needs a real PostgreSQL service.
with patch("psycopg.connect") as mocked_connect:
    connection = MagicMock()
    cursor = MagicMock()
    mocked_connect.return_value.__enter__.return_value = connection
    connection.cursor.return_value.__enter__.return_value = cursor
    cursor.fetchone.return_value = (1,)
    import app as tracker


VALID_SHOW = {
    "title": "Example",
    "tmdb_id": "123",
    "status": "watching",
    "episodes_watched": {"1": [1, 2]},
}

VALID_HISTORY = {
    "id": "history-12345678",
    "tmdb_id": "123",
    "season": 1,
    "episode": 2,
    "date": "2026-07-24",
    "watched_at": "2026-07-24T12:00:00Z",
}


def authenticated_session(client):
    with client.session_transaction() as session:
        session["authenticated"] = True
        session["session_version"] = 1
        session["csrf_token"] = "csrf-test-token"


class ValidationTests(unittest.TestCase):
    def test_impossible_date_is_rejected(self):
        with self.assertRaises(tracker.BackupValidationError):
            tracker.validate_calendar_date("2026-02-31", "date")
        with self.assertRaises(tracker.BackupValidationError):
            tracker.validate_calendar_date("2025-02-29", "date")
        self.assertEqual(
            tracker.validate_calendar_date("2024-02-29", "date"),
            "2024-02-29",
        )

    def test_sync_rejects_null_show(self):
        with self.assertRaises(tracker.BackupValidationError):
            tracker.validate_sync_delta_payload({"showsUpsert": {"123": None}})

    def test_sync_normalizes_valid_records(self):
        values = tracker.validate_sync_delta_payload({
            "showsUpsert": {"123": VALID_SHOW},
            "historyUpsert": {"history-12345678": VALID_HISTORY},
            "stateUpsert": {
                "profile": {"username": "Owner", "favorite_shows": ["123"]}
            },
        })
        self.assertEqual(values[0]["123"]["episodes_watched"]["1"], [1, 2])
        self.assertEqual(values[2]["history-12345678"]["id"], "history-12345678")

    def test_legacy_failed_sync_items_remain_importable(self):
        values = tracker.validate_sync_delta_payload({
            "stateUpsert": {
                "metadata_sync": {
                    "pending": [],
                    "failed": ["123", {"id": "456", "title": "Example", "error": "timeout"}],
                }
            }
        })
        failed = values[5]["metadata_sync"]["failed"]
        self.assertEqual(failed[0]["showId"], "123")
        self.assertEqual(failed[1]["showId"], "456")

    def test_conflicting_deltas_are_detected(self):
        left = tracker.normalize_delta({"123": VALID_SHOW}, [], {}, [], None, {})
        right = tracker.normalize_delta({}, ["123"], {}, [], None, {})
        self.assertTrue(tracker.deltas_conflict(left, right))

    def test_backup_validation_rejects_malformed_history(self):
        backup = {
            "app": tracker.APP_NAME,
            "backupType": "native-app-backup",
            "backupVersion": 2,
            "schemaVersion": tracker.SCHEMA_VERSION,
            "data": {
                "shows": {"123": VALID_SHOW},
                "history": [{**VALID_HISTORY, "season": "wrong"}],
                "profile": {"username": "Owner", "favorite_shows": []},
            },
        }
        with self.assertRaises(tracker.BackupValidationError):
            tracker.validate_and_normalize_backup(backup)


class RouteSecurityTests(unittest.TestCase):
    def setUp(self):
        self.schema_patch = patch.object(tracker, "ensure_schema", return_value=None)
        self.schema_patch.start()
        self.app = tracker.create_app()
        self.app.config.update(TESTING=True, SESSION_COOKIE_SECURE=False)
        self.client = self.app.test_client()
        self.account = {
            "username": "admin",
            "password_hash": "unused",
            "session_version": 1,
            "updated_at": None,
        }

    def tearDown(self):
        self.schema_patch.stop()

    def test_api_requires_authentication(self):
        with patch.object(tracker, "read_admin_account", return_value=self.account):
            response = self.client.get("/api/state")
        self.assertEqual(response.status_code, 401)

    def test_patch_requires_csrf(self):
        authenticated_session(self.client)
        with patch.object(tracker, "read_admin_account", return_value=self.account):
            response = self.client.patch("/api/state", json={})
        self.assertEqual(response.status_code, 403)

    def test_malformed_sync_is_rejected_before_database_write(self):
        authenticated_session(self.client)
        payload = {
            "baseRevision": 0,
            "operationId": "operation-valid-1234",
            "showsUpsert": {"123": None},
        }
        with patch.object(tracker, "read_admin_account", return_value=self.account), patch.object(
            tracker, "database_connection", side_effect=AssertionError("database should not be reached")
        ):
            response = self.client.patch(
                "/api/state",
                json=payload,
                headers={"X-CSRF-Token": "csrf-test-token"},
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["code"], "invalid_sync_record")

    def test_backup_export_blocks_poisoned_database_records(self):
        authenticated_session(self.client)
        malformed = {
            "shows": {"123": None},
            "history": [],
            "profile": {"username": "Owner", "favorite_shows": []},
        }
        with patch.object(tracker, "read_admin_account", return_value=self.account), patch.object(
            tracker, "read_tracker_data", return_value=(malformed, 1)
        ):
            response = self.client.get("/api/backup")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.get_json()["code"], "backup_validation_failed")


if __name__ == "__main__":
    unittest.main()
