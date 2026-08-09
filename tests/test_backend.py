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


def mocked_database_connection(*fetchone_values):
    connection = MagicMock()
    connection.__enter__.return_value = connection
    cursor = MagicMock()
    connection.cursor.return_value.__enter__.return_value = cursor
    cursor.fetchone.side_effect = list(fetchone_values)
    return connection, cursor


class ValidationTests(unittest.TestCase):
    def test_admin_bootstrap_accepts_legacy_env_names(self):
        with patch.dict(
            os.environ,
            {
                "APP_USERNAME": "",
                "APP_PASSWORD_HASH": "",
                "ADMIN_USERNAME": "legacy-admin",
                "ADMIN_PASSWORD_HASH": "legacy-hash",
            },
        ):
            self.assertEqual(
                tracker.bootstrap_admin_credentials(),
                ("legacy-admin", "legacy-hash"),
            )

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

    def test_integer_validation_rejects_fractional_values(self):
        for value in (1.5, "1.5"):
            with self.subTest(value=value):
                with self.assertRaises(tracker.BackupValidationError):
                    tracker.backup_int(value, "episode")
        self.assertEqual(tracker.backup_int("2", "episode"), 2)

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

    def test_read_tracker_data_uses_consistent_read_snapshot(self):
        connection = MagicMock()
        connection.__enter__.return_value = connection
        cursor = MagicMock()
        connection.cursor.return_value.__enter__.return_value = cursor
        cursor.fetchall.side_effect = [
            [("123", VALID_SHOW)],
            [("history-12345678", VALID_HISTORY)],
            [("profile", {"username": "Owner", "favorite_shows": []})],
        ]
        cursor.fetchone.return_value = (7,)

        with patch.object(tracker, "database_connection", return_value=connection):
            data, revision = tracker.read_tracker_data()

        self.assertEqual(revision, 7)
        self.assertEqual(data["shows"]["123"]["title"], "Example")
        self.assertEqual(
            cursor.execute.call_args_list[0].args[0],
            "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        )


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

    def test_healthz_is_public_and_minimal(self):
        connection, _cursor = mocked_database_connection((1,), (tracker.SCHEMA_VERSION,))

        with patch.object(tracker, "database_connection", return_value=connection):
            response = self.client.get("/healthz")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"ok": True})

    def test_healthz_reports_unhealthy_without_details(self):
        connection, _cursor = mocked_database_connection((1,), (0,))

        with patch.object(tracker, "database_connection", return_value=connection):
            response = self.client.get("/healthz")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json(), {"ok": False})

    def test_api_health_remains_private_and_detailed(self):
        unauthenticated = self.client.get("/api/health")
        self.assertEqual(unauthenticated.status_code, 401)

        authenticated_session(self.client)
        connection, _cursor = mocked_database_connection((1,), (tracker.SCHEMA_VERSION,))

        with patch.object(tracker, "read_admin_account", return_value=self.account), patch.object(
            tracker, "database_connection", return_value=connection
        ):
            response = self.client.get("/api/health")

        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["app"], tracker.APP_NAME)
        self.assertTrue(payload["database"])
        self.assertEqual(payload["schemaVersion"], tracker.SCHEMA_VERSION)

    def test_patch_requires_csrf(self):
        authenticated_session(self.client)
        with patch.object(tracker, "read_admin_account", return_value=self.account):
            response = self.client.patch("/api/state", json={})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.get_json()["code"], "csrf_rejected")

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

    def test_malformed_json_patch_returns_json_error(self):
        authenticated_session(self.client)
        with patch.object(tracker, "read_admin_account", return_value=self.account):
            response = self.client.patch(
                "/api/state",
                data="{",
                content_type="application/json",
                headers={"X-CSRF-Token": "csrf-test-token"},
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "Invalid JSON body")

    def test_non_ascii_username_login_fails_without_crashing(self):
        with self.client.session_transaction() as session:
            session["csrf_token"] = "csrf-test-token"
        hasher = MagicMock()
        hasher.verify.return_value = False
        with patch.object(tracker, "read_admin_account", return_value=self.account), patch.object(
            tracker, "login_is_limited", return_value=False
        ), patch.object(tracker, "PASSWORD_HASHER", hasher), patch.object(
            tracker, "record_login_failure", return_value=None
        ):
            response = self.client.post(
                "/login",
                data={
                    "csrf_token": "csrf-test-token",
                    "username": "admín",
                    "password": "wrong-password",
                },
            )
        self.assertEqual(response.status_code, 401)

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

    def test_backup_export_returns_native_restore_payload(self):
        authenticated_session(self.client)
        data = {
            "shows": {"123": VALID_SHOW},
            "history": [VALID_HISTORY],
            "profile": {"username": "Owner", "favorite_shows": ["123"]},
        }

        with patch.object(tracker, "read_admin_account", return_value=self.account), patch.object(
            tracker, "read_tracker_data", return_value=(data, 7)
        ):
            response = self.client.get("/api/backup")

        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["app"], tracker.APP_NAME)
        self.assertEqual(payload["backupType"], "native-app-backup")
        self.assertEqual(payload["summary"]["shows"], 1)
        self.assertEqual(payload["data"]["shows"]["123"]["title"], "Example")
        self.assertIn("tv-tracker-online-backup.json", response.headers["Content-Disposition"])

    def test_backup_import_restores_valid_native_payload(self):
        authenticated_session(self.client)
        backup = {
            "app": tracker.APP_NAME,
            "backupType": "native-app-backup",
            "backupVersion": tracker.BACKUP_VERSION,
            "schemaVersion": tracker.SCHEMA_VERSION,
            "data": {
                "shows": {"123": VALID_SHOW},
                "history": [VALID_HISTORY],
                "profile": {"username": "Owner", "favorite_shows": ["123"]},
            },
        }

        with patch.object(tracker, "read_admin_account", return_value=self.account), patch.object(
            tracker, "replace_tracker_data_transactionally", return_value=8
        ) as replace_data:
            response = self.client.post(
                "/api/backup/import",
                json=backup,
                headers={"X-CSRF-Token": "csrf-test-token"},
            )

        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["revision"], 8)
        self.assertEqual(payload["summary"]["shows"], 1)
        replace_data.assert_called_once()
        restored_data = replace_data.call_args.args[0]
        self.assertEqual(restored_data["shows"]["123"]["title"], "Example")

    def test_sync_rate_limit_errors_include_code(self):
        authenticated_session(self.client)
        with patch.object(tracker, "read_admin_account", return_value=self.account), patch.object(
            tracker, "sync_request_is_limited", return_value=True
        ):
            revision_response = self.client.get("/api/revision")
            changes_response = self.client.get("/api/changes")

        self.assertEqual(revision_response.status_code, 429)
        self.assertEqual(revision_response.get_json()["code"], "sync_rate_limited")
        self.assertEqual(changes_response.status_code, 429)
        self.assertEqual(changes_response.get_json()["code"], "sync_rate_limited")

    def test_invalid_changes_query_errors_include_code(self):
        authenticated_session(self.client)
        with patch.object(tracker, "read_admin_account", return_value=self.account), patch.object(
            tracker, "sync_request_is_limited", return_value=False
        ):
            revision_response = self.client.get("/api/changes?since=bad")
            limit_response = self.client.get("/api/changes?limit=999")

        self.assertEqual(revision_response.status_code, 400)
        self.assertEqual(revision_response.get_json()["code"], "invalid_revision")
        self.assertEqual(limit_response.status_code, 400)
        self.assertEqual(limit_response.get_json()["code"], "invalid_change_limit")


class V2RouteSecurityTests(unittest.TestCase):
    def setUp(self):
        self.schema_patch = patch.object(tracker, "ensure_schema", return_value=None)
        self.cleanup_patch = patch.object(tracker, "cleanup_stored_tracker_data", return_value=None)
        self.schema_patch.start()
        self.cleanup_patch.start()
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
        self.cleanup_patch.stop()
        self.schema_patch.stop()

    def test_root_redirects_logged_out_user_to_login(self):
        with patch.object(tracker, "read_admin_account", return_value=self.account):
            response = self.client.get("/")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/login")

    def test_protected_show_route_stores_server_side_return_path(self):
        with patch.object(tracker, "read_admin_account", return_value=self.account):
            response = self.client.get("/app/show/1399-game-of-thrones")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/login")
        with self.client.session_transaction() as session:
            self.assertEqual(session.get("post_login_path"), "/app/show/1399-game-of-thrones")

    def test_authenticated_episode_route_renders_app_shell(self):
        authenticated_session(self.client)
        with patch.object(tracker, "read_admin_account", return_value=self.account):
            response = self.client.get("/app/show/1399/season/1/episode/3")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'episode-detail-page', response.data)
        self.assertIn(b'meta name="app-route"', response.data)

    def test_authenticated_section_route_renders_app_shell(self):
        authenticated_session(self.client)
        with patch.object(tracker, "read_admin_account", return_value=self.account):
            response = self.client.get("/app/discover")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'meta name="app-route" content="/app/discover"', response.data)

    def test_security_headers_use_local_frontend_sources(self):
        authenticated_session(self.client)
        with patch.object(tracker, "read_admin_account", return_value=self.account):
            response = self.client.get("/app/list/watching")
        csp = response.headers.get("Content-Security-Policy", "")
        self.assertIn("script-src 'self'", csp)
        self.assertIn("style-src 'self' 'unsafe-inline'", csp)
        self.assertNotIn("cdn.jsdelivr.net", csp)

    def test_trailing_app_route_redirects_to_canonical_path(self):
        authenticated_session(self.client)
        with patch.object(tracker, "read_admin_account", return_value=self.account):
            response = self.client.get("/app/show/1399-game-of-thrones/")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/app/show/1399-game-of-thrones")

    def test_invalid_app_route_is_not_accepted(self):
        authenticated_session(self.client)
        with patch.object(tracker, "read_admin_account", return_value=self.account):
            response = self.client.get("/app/show/1399/private-notes")
        self.assertEqual(response.status_code, 404)

    def test_id_only_detail_route_renders_shell_for_client_canonicalization(self):
        authenticated_session(self.client)
        with patch.object(tracker, "read_admin_account", return_value=self.account):
            response = self.client.get("/app/show/1399")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'meta name="app-route" content="/app/show/1399"', response.data)

    def test_removed_role_person_alias_is_not_accepted(self):
        authenticated_session(self.client)
        with patch.object(tracker, "read_admin_account", return_value=self.account):
            response = self.client.get("/app/actor/525-christopher-nolan")
        self.assertEqual(response.status_code, 404)

    def test_page_not_found_uses_friendly_error_page(self):
        response = self.client.get("/not-a-real-page")
        self.assertEqual(response.status_code, 404)
        self.assertIn(b"Are you lost?", response.data)
        self.assertIn(b"BACK TO APP", response.data)
        self.assertNotIn(b"This page is off the map.", response.data)

    def test_api_not_found_returns_json(self):
        response = self.client.get("/api/not-a-real-endpoint")
        self.assertEqual(response.status_code, 404)
        self.assertTrue(response.is_json)
        self.assertEqual(response.get_json()["code"], "not_found")

    def test_page_server_error_uses_friendly_error_page(self):
        self.app.config["PROPAGATE_EXCEPTIONS"] = False

        @self.app.get("/test-500")
        def test_500():
            raise RuntimeError("test failure")

        response = self.client.get("/test-500")
        self.assertEqual(response.status_code, 500)
        self.assertIn(b"Houston, we have a problem", response.data)
        self.assertIn(b"Something went wrong. Try again in a moment.", response.data)

    def test_api_server_error_returns_json(self):
        self.app.config["PROPAGATE_EXCEPTIONS"] = False

        @self.app.get("/api/test-500")
        def api_test_500():
            raise RuntimeError("test failure")

        response = self.client.get("/api/test-500")
        self.assertEqual(response.status_code, 500)
        self.assertTrue(response.is_json)
        self.assertEqual(response.get_json()["code"], "server_error")

    def test_safe_next_url_rejects_external_and_sensitive_paths(self):
        self.assertEqual(tracker.safe_next_url("https://example.com"), "/app/list/watching")
        self.assertEqual(tracker.safe_next_url("//example.com"), "/app/list/watching")
        self.assertEqual(tracker.safe_next_url("/api/state"), "/app/list/watching")
        self.assertEqual(
            tracker.safe_next_url("/app/show/1399/season/1/episode/3?token=secret"),
            "/app/show/1399/season/1/episode/3",
        )

    def test_signup_redirect_selects_signup_tab(self):
        response = self.client.get("/signup")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/login")
        with patch.object(tracker, "read_admin_account", return_value=self.account):
            login_response = self.client.get("/login")
        self.assertEqual(login_response.status_code, 200)
        self.assertIn(b'data-initial-auth-tab="signup"', login_response.data)


if __name__ == "__main__":
    unittest.main()
