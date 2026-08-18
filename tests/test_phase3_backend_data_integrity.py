from __future__ import annotations

import unittest

from flask import Flask, jsonify

from tvtracker.data_integrity import install_backup_summary_hardening, summarize_history


class Phase3BackendDataIntegrityTests(unittest.TestCase):
    def test_history_summary_keeps_movies_out_of_regular_tv_count(self):
        history = [
            {"id": "regular", "tmdb_id": "10", "season": 1, "episode": 1},
            {"id": "special", "tmdb_id": "10", "season": 0, "episode": 1, "special": True},
            {"id": "movie", "media_type": "movie", "movie_id": "20", "tmdb_id": "20"},
            {"id": "other"},
        ]
        self.assertEqual(
            summarize_history(history),
            {
                "historyEntries": 4,
                "regularHistoryEntries": 1,
                "specialHistoryEntries": 1,
                "movieHistoryEntries": 1,
                "otherHistoryEntries": 1,
            },
        )

    def test_wsgi_boundary_corrects_backup_summary_without_touching_data(self):
        app = Flask(__name__)
        app.config.update(TESTING=True, SECRET_KEY="phase3")
        install_backup_summary_hardening(app)

        original_history = [
            {"id": "regular", "tmdb_id": "10", "season": 1, "episode": 1},
            {"id": "movie", "media_type": "movie", "movie_id": "20", "tmdb_id": "20"},
        ]

        @app.get("/api/backup")
        def backup():
            return jsonify(
                {
                    "app": "TV Tracker",
                    "summary": {
                        "historyEntries": 2,
                        "regularHistoryEntries": 2,
                    },
                    "data": {"shows": {}, "history": original_history},
                }
            )

        response = app.test_client().get("/api/backup")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["summary"]["regularHistoryEntries"], 1)
        self.assertEqual(payload["summary"]["movieHistoryEntries"], 1)
        self.assertEqual(payload["data"]["history"], original_history)

    def test_non_backup_json_responses_are_unchanged(self):
        app = Flask(__name__)
        app.config.update(TESTING=True, SECRET_KEY="phase3")
        install_backup_summary_hardening(app)

        @app.get("/api/other")
        def other():
            return jsonify({"ok": True, "summary": {"regularHistoryEntries": 99}})

        response = app.test_client().get("/api/other")
        self.assertEqual(response.get_json(), {"ok": True, "summary": {"regularHistoryEntries": 99}})


if __name__ == "__main__":
    unittest.main()
