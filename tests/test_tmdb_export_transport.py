"""Exercise the shared collection/export seam with urllib's real GET handling."""

import gzip
import json
import sys
import threading
import types
import unittest
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from unittest.mock import patch

from tvtracker.media import tmdb_exports


class TmdbExportTransportTests(unittest.TestCase):
    def test_collection_and_export_requests_are_gets_with_a_timeout(self):
        requests = []
        detail = {"id": 263, "name": "The Dark Knight Collection", "parts": [
            {"id": 272, "title": "Batman Begins", "release_date": "2005-06-10"},
        ]}

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append((self.path, self.headers.get("Content-Length")))
                if self.path.startswith("/3/collection/"):
                    body = json.dumps(detail).encode()
                else:
                    body = gzip.compress(b'{"id":263,"name":"Test Collection","popularity":1}\n')
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(thread.join)
        self.addCleanup(server.shutdown)
        target = "http://127.0.0.1:" + str(server.server_port)

        def local_request(url, **kwargs):
            return Request(target + urlsplit(url).path, **kwargs)

        # Keep the actual urllib signature and HTTP processing, isolating only
        # the application import and external host. A permissive MagicMock at
        # urlopen would silently accept timeout in the request-body position.
        legacy_app = types.ModuleType("app")
        legacy_app.urlopen = urlopen
        with patch.dict(sys.modules, {"app": legacy_app}), patch.object(
            tmdb_exports, "Request", side_effect=local_request
        ), patch.object(tmdb_exports, "required_env", return_value="test-key"), patch.object(
            legacy_app, "urlopen", wraps=urlopen
        ) as transport:
            calls = [
                (lambda: tmdb_exports.fetch_tmdb_collection_detail(263), "/3/collection/263"),
                (lambda: tmdb_exports.fetch_tmdb_collection_export(date(2026, 9, 6)), "/p/exports/collection_ids_09_06_2026.json.gz"),
                (lambda: tmdb_exports.fetch_tmdb_network_export(date(2026, 9, 6)), "/p/exports/tv_network_ids_09_06_2026.json.gz"),
            ]
            for fetch, path in calls:
                with self.subTest(path=path):
                    payload = fetch()
                    self.assertTrue(payload)
                    self.assertEqual(requests[-1], (path, None))
                    self.assertEqual(transport.call_args.kwargs, {"timeout": 20})
                    self.assertEqual(len(transport.call_args.args), 1)
            self.assertEqual(transport.call_count, 3)


if __name__ == "__main__":
    unittest.main()
