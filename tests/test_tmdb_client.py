import os
import unittest
from unittest.mock import patch

from tvtracker.media import tmdb_client


class FakeResponse:
    def __init__(self, payload: bytes):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return self.payload


class TmdbClientTests(unittest.TestCase):
    def test_notification_fetch_uses_shared_tmdb_path_allowlist(self):
        with patch.dict(os.environ, {"TMDB_API_KEY": "test-key"}, clear=False), patch.object(
            tmdb_client,
            "urlopen",
            return_value=FakeResponse(b'{"id":123}'),
        ) as mocked_urlopen:
            payload = tmdb_client.fetch_tmdb_notification_json(
                "tv/123",
                {"language": "en-US"},
            )

        self.assertEqual(payload, {"id": 123})
        request = mocked_urlopen.call_args.args[0]
        self.assertTrue(request.full_url.startswith("https://api.themoviedb.org/3/tv/123?"))
        self.assertIn("language=en-US", request.full_url)
        self.assertIn("api_key=test-key", request.full_url)

    def test_notification_fetch_rejects_non_allowlisted_path_before_network(self):
        with patch.object(tmdb_client, "urlopen") as mocked_urlopen:
            with self.assertRaises(RuntimeError):
                tmdb_client.fetch_tmdb_notification_json("https://example.com/evil")

        mocked_urlopen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
