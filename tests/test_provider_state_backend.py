import os
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

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

with patch("psycopg.connect") as mocked_connect:
    connection = MagicMock()
    cursor = MagicMock()
    mocked_connect.return_value.__enter__.return_value = connection
    connection.cursor.return_value.__enter__.return_value = cursor
    cursor.fetchone.return_value = (1,)
    import app as tracker


PROVIDER_STATE = {
    "tv:123:MY": {
        "media": "tv",
        "id": "123",
        "region": "MY",
        "refreshed_at": "2026-08-14T12:00:00Z",
        "providers": {
            "id": 123,
            "results": {
                "MY": {
                    "flatrate": [
                        {
                            "provider_id": 8,
                            "provider_name": "Netflix",
                            "display_priority": 0,
                        }
                    ]
                }
            },
        },
    }
}


class ProviderStateBackendTests(unittest.TestCase):
    def test_streaming_region_is_valid_profile_state(self):
        profile = tracker.validate_profile_record({
            "username": "Owner",
            "favorite_shows": [],
            "favorite_movies": [],
            "streaming_region": "my",
        })
        self.assertEqual(profile["streaming_region"], "MY")

    def test_invalid_streaming_region_is_rejected(self):
        with self.assertRaises(tracker.BackupValidationError):
            tracker.validate_profile_record({
                "username": "Owner",
                "favorite_shows": [],
                "favorite_movies": [],
                "streaming_region": "USA",
            })

    def test_provider_metadata_is_valid_sync_state(self):
        key, value = tracker.validate_state_record("provider_metadata", PROVIDER_STATE)
        self.assertEqual(key, "provider_metadata")
        self.assertEqual(value["tv:123:MY"]["region"], "MY")
        self.assertEqual(value["tv:123:MY"]["id"], "123")

    def test_provider_metadata_survives_native_backup_validation(self):
        data = tracker.validate_tracker_data({
            "shows": {},
            "history": [],
            "profile": {
                "username": "Owner",
                "favorite_shows": [],
                "favorite_movies": [],
                "streaming_region": "MY",
            },
            "provider_metadata": PROVIDER_STATE,
        })
        self.assertEqual(data["provider_metadata"], PROVIDER_STATE)
        self.assertEqual(data["profile"]["streaming_region"], "MY")

    def test_sync_delta_accepts_provider_metadata(self):
        values = tracker.validate_sync_delta_payload({
            "stateUpsert": {"provider_metadata": PROVIDER_STATE}
        })
        self.assertEqual(values[5]["provider_metadata"], PROVIDER_STATE)

    def test_provider_metadata_rejects_wrong_region_key(self):
        invalid = {
            "tv:123:US": {
                **PROVIDER_STATE["tv:123:MY"],
                "region": "MY",
            }
        }
        with self.assertRaises(tracker.BackupValidationError):
            tracker.validate_state_record("provider_metadata", invalid)


if __name__ == "__main__":
    unittest.main()
