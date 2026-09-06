import copy
import unittest

from tvtracker.backup.validation import (
    BackupValidationError,
    validate_and_normalize_backup,
    validate_movie_tracking_state,
    validate_profile_record,
    validate_sync_delta_payload,
)


class MovieAdultClassificationTests(unittest.TestCase):
    def movie(self, **updates):
        return {
            "id": "101", "tmdb_id": "101", "title": "Synthetic movie",
            "watched": True, "plan": False, "favorite": True,
            "watched_at": "2026-09-06T00:00:00Z",
            "updated_at": "2026-09-06T00:00:00Z", **updates,
        }

    def test_sync_preserves_both_explicit_classifications(self):
        for adult in (True, False):
            with self.subTest(adult=adult):
                payload = {"stateUpsert": {
                    "movies": {"101": self.movie(adult=adult)},
                    "profile": {"favorite_movies": [{"id": "101", "adult": adult}]},
                }}
                original = copy.deepcopy(payload)
                state = validate_sync_delta_payload(payload)[5]
                self.assertIs(state["movies"]["101"]["adult"], adult)
                self.assertIs(state["profile"]["favorite_movies"][0]["adult"], adult)
                self.assertTrue(state["movies"]["101"]["watched"])
                self.assertFalse(state["movies"]["101"]["plan"])
                self.assertEqual(state["movies"]["101"]["watched_at"], self.movie()["watched_at"])
                self.assertEqual(payload, original)

    def test_missing_classification_stays_unknown(self):
        state = validate_movie_tracking_state({"101": self.movie()})
        self.assertNotIn("adult", state["101"])
        profile = validate_profile_record({"favorite_movies": [{"id": "101"}]})
        self.assertNotIn("adult", profile["favorite_movies"][0])

    def test_invalid_classification_is_not_coerced(self):
        for invalid in (None, 0, 1, "true", "false", [], {}):
            with self.subTest(value=invalid):
                with self.assertRaises(BackupValidationError):
                    validate_movie_tracking_state({"101": self.movie(adult=invalid)})
                with self.assertRaises(BackupValidationError):
                    validate_profile_record({"favorite_movies": [{"id": "101", "adult": invalid}]})

    def test_unrelated_fields_still_rejected(self):
        with self.assertRaisesRegex(BackupValidationError, "unsupported fields"):
            validate_movie_tracking_state({"101": self.movie(adult=False, arbitrary=True)})

    def test_classification_does_not_create_tracking_intent(self):
        self.assertEqual(validate_movie_tracking_state({"101": {
            "id": "101", "adult": True,
        }}), {})

    def test_native_backup_roundtrip_keeps_classification_and_history(self):
        history = [{"id": "movie-watched-101", "media_type": "movie",
                    "movie_id": "101", "watched_at": "2026-09-06T00:00:00Z"}]
        backup = {"app": "TV Tracker", "backupType": "native-app-backup",
                  "backupVersion": 1, "schemaVersion": 1,
                  "data": {"shows": {}, "history": history,
                           "movies": {"101": self.movie(adult=True)},
                           "profile": {"favorite_movies": [{"id": "101", "adult": False}]}}}
        data, _ = validate_and_normalize_backup(
            backup, backup_app_name="TV Tracker", max_schema_version=7,
            supported_backup_versions={1},
        )
        self.assertIs(data["movies"]["101"]["adult"], True)
        self.assertIs(data["profile"]["favorite_movies"][0]["adult"], False)
        self.assertEqual(data["history"][0]["watched_at"], history[0]["watched_at"])
        backup["data"] = data
        restored, _ = validate_and_normalize_backup(
            backup, backup_app_name="TV Tracker", max_schema_version=7,
            supported_backup_versions={1},
        )
        self.assertEqual(restored, data)


if __name__ == "__main__":
    unittest.main()
