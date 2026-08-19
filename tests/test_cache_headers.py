import os
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

from tvtracker.infrastructure.static_assets import install_static_asset_versioning, static_asset_version

try:
    import psycopg  # noqa: F401
except ModuleNotFoundError:
    psycopg_stub = types.ModuleType("psycopg")
    psycopg_stub.connect = lambda *args, **kwargs: None
    psycopg_stub.Error = Exception
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

with patch("psycopg.connect") as mocked_connect:
    connection = MagicMock()
    cursor = MagicMock()
    mocked_connect.return_value.__enter__.return_value = connection
    connection.cursor.return_value.__enter__.return_value = cursor
    cursor.fetchone.return_value = (1,)
    import app as tracker


def authenticated_session(client):
    with client.session_transaction() as session:
        session["authenticated"] = True
        session["session_version"] = 1
        session["csrf_token"] = "csrf-test-token"


class CacheHeaderTests(unittest.TestCase):
    def setUp(self):
        self.schema_patch = patch.object(tracker, "ensure_schema", return_value=None)
        self.cleanup_patch = patch.object(
            tracker, "cleanup_stored_tracker_data", return_value=None
        )
        self.schema_patch.start()
        self.cleanup_patch.start()
        self.app = tracker.create_app()
        install_static_asset_versioning(self.app)
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

    def test_authenticated_api_responses_default_to_no_store(self):
        authenticated_session(self.client)
        with patch.object(tracker, "read_admin_account", return_value=self.account):
            response = self.client.get("/api/admin/account")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("Cache-Control"), "no-store")

    def test_static_cache_is_immutable_only_for_matching_content_version(self):
        filename = "js/config.js"
        version = static_asset_version(self.app.static_folder, filename)

        versioned = self.client.get(f"/static/{filename}?v={version}")
        unversioned = self.client.get(f"/static/{filename}")
        stale = self.client.get(f"/static/{filename}?v=stale")

        self.assertEqual(versioned.status_code, 200)
        self.assertEqual(
            versioned.headers.get("Cache-Control"),
            "public, max-age=31536000, immutable",
        )
        self.assertEqual(
            unversioned.headers.get("Cache-Control"),
            "public, max-age=0, must-revalidate",
        )
        self.assertEqual(
            stale.headers.get("Cache-Control"),
            "public, max-age=0, must-revalidate",
        )

    def test_tmdb_proxy_preserves_private_cache_control(self):
        authenticated_session(self.client)
        upstream = MagicMock()
        upstream.status = 200
        upstream.read.return_value = b'{"id":123}'
        upstream_context = MagicMock()
        upstream_context.__enter__.return_value = upstream
        upstream_context.__exit__.return_value = False

        with patch.dict(os.environ, {"TMDB_API_KEY": "tmdb-test-key"}), patch.object(
            tracker, "read_admin_account", return_value=self.account
        ), patch.object(tracker, "urlopen", return_value=upstream_context):
            response = self.client.get("/api/tmdb/tv/123")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get("Cache-Control"),
            "private, max-age=300",
        )


if __name__ == "__main__":
    unittest.main()
