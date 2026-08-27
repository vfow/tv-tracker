import io
import json
import unittest

from tools import verify_release_provenance


class ReleaseProvenanceTests(unittest.TestCase):
    def test_accepts_merged_pull_request_targeting_main(self):
        payload = [
            {
                "number": 31,
                "state": "closed",
                "merged_at": "2026-08-27T13:00:00Z",
                "base": {"ref": "main"},
            }
        ]
        output = io.StringIO()

        exit_code = verify_release_provenance.main(
            io.StringIO(json.dumps(payload)),
            output,
        )

        self.assertEqual(exit_code, 0)
        self.assertEqual(
            json.loads(output.getvalue()),
            {"ok": True, "pullRequest": 31},
        )

    def test_rejects_open_unmerged_or_wrong_base_pull_requests(self):
        cases = (
            [{"number": 1, "state": "open", "merged_at": None, "base": {"ref": "main"}}],
            [{"number": 2, "state": "closed", "merged_at": None, "base": {"ref": "main"}}],
            [{"number": 3, "state": "closed", "merged_at": "2026-08-27T13:00:00Z", "base": {"ref": "develop"}}],
        )
        for payload in cases:
            with self.subTest(payload=payload):
                with self.assertRaises(SystemExit):
                    verify_release_provenance.main(io.StringIO(json.dumps(payload)), io.StringIO())

    def test_rejects_malformed_api_response(self):
        with self.assertRaises(ValueError):
            verify_release_provenance.merged_main_pull_request({"not": "a list"})


if __name__ == "__main__":
    unittest.main()
