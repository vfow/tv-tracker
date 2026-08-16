from __future__ import annotations

import os
import unittest
from unittest.mock import patch

import final_notifications as final


class FinalNotificationPureTests(unittest.TestCase):
    def test_meaningful_movie_release_uses_selected_region_and_allowed_types(self):
        payload = {
            "release_dates": {
                "results": [
                    {
                        "iso_3166_1": "US",
                        "release_dates": [
                            {"type": 1, "release_date": "2026-01-01T00:00:00.000Z"},
                            {"type": 3, "release_date": "2026-03-10T00:00:00.000Z"},
                            {"type": 4, "release_date": "2026-03-08T00:00:00.000Z"},
                            {"type": 5, "release_date": "2026-02-01T00:00:00.000Z"},
                        ],
                    },
                    {
                        "iso_3166_1": "MY",
                        "release_dates": [
                            {"type": 1, "release_date": "2026-02-01T00:00:00.000Z"},
                            {"type": 2, "release_date": "2026-04-12T00:00:00.000Z"},
                            {"type": 6, "release_date": "2026-04-20T00:00:00.000Z"},
                        ],
                    },
                ]
            }
        }
        self.assertEqual(final._meaningful_release_date(payload, "MY"), "2026-04-12")
        self.assertEqual(final._meaningful_release_date(payload, "US"), "2026-03-08")

    def test_meaningful_movie_release_ignores_premiere_and_physical(self):
        payload = {
            "release_dates": {
                "results": [{
                    "iso_3166_1": "MY",
                    "release_dates": [
                        {"type": 1, "release_date": "2026-01-01T00:00:00.000Z"},
                        {"type": 5, "release_date": "2026-02-01T00:00:00.000Z"},
                    ],
                }]
            }
        }
        self.assertEqual(final._meaningful_release_date(payload, "MY"), "")

    def test_malformed_movie_release_dates_are_ignored(self):
        payload = {
            "release_dates": {
                "results": [{
                    "iso_3166_1": "MY",
                    "release_dates": [
                        {"type": 3, "release_date": "not-a-date"},
                        {"type": "nope", "release_date": "2026-05-01"},
                    ],
                }]
            }
        }
        self.assertEqual(final._meaningful_release_date(payload, "MY"), "")

    def test_release_update_copy_covers_all_four_states(self):
        self.assertEqual(final._movie_update_message("Movie", "", "2026-09-01")[0], "movie_release_announced")
        self.assertEqual(final._movie_update_message("Movie", "2026-09-01", "")[0], "movie_release_removed")
        self.assertEqual(final._movie_update_message("Movie", "2026-09-10", "2026-09-01")[0], "movie_release_earlier")
        self.assertEqual(final._movie_update_message("Movie", "2026-09-01", "2026-09-10")[0], "movie_release_delayed")

    def test_push_configuration_is_optional(self):
        with patch.dict(os.environ, {}, clear=True):
            config = final.push_config()
        self.assertFalse(config["configured"])
        self.assertEqual(config["publicKey"], "")

    def test_push_configuration_requires_all_values(self):
        env = {
            "VAPID_PUBLIC_KEY": "public",
            "VAPID_PRIVATE_KEY": "private",
            "VAPID_SUBJECT": "mailto:test@example.com",
        }
        with patch.dict(os.environ, env, clear=True):
            config = final.push_config()
        self.assertTrue(config["configured"])

    def test_service_worker_has_push_and_click_but_no_fetch_handler(self):
        source = final._service_worker_source()
        self.assertIn('addEventListener("push"', source)
        self.assertIn('addEventListener("notificationclick"', source)
        self.assertNotIn('addEventListener("fetch"', source)
        self.assertIn("visibilityState", source)
        self.assertIn("tvtracker-notification-refresh", source)

    def test_manifest_is_standalone_and_same_origin(self):
        manifest = final._manifest_payload()
        self.assertEqual(manifest["name"], "TV Tracker")
        self.assertEqual(manifest["start_url"], "/app/list/watching")
        self.assertEqual(manifest["display"], "standalone")
        self.assertTrue(manifest["icons"])

    def test_retry_delay_is_bounded(self):
        self.assertLessEqual(final._retry_delay(100).total_seconds(), 60 * 60)


if __name__ == "__main__":
    unittest.main()
