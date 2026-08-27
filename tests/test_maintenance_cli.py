import io
import json
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

from tvtracker import maintenance


class MaintenanceCliTests(unittest.TestCase):
    def test_cleanup_legacy_is_explicit_and_fail_visible(self):
        output = io.StringIO()
        with patch.object(
            maintenance,
            "cleanup_stored_tracker_data",
            return_value=3,
        ) as mocked_cleanup, redirect_stdout(output):
            exit_code = maintenance.main(["cleanup-legacy"])

        self.assertEqual(exit_code, 0)
        mocked_cleanup.assert_called_once_with(
            maintenance.connect_database,
            suppress_errors=False,
        )
        self.assertEqual(
            json.loads(output.getvalue()),
            {"ok": True, "operation": "cleanup-legacy", "rowsChanged": 3},
        )

    def test_cleanup_failure_propagates_to_operator(self):
        with patch.object(
            maintenance,
            "cleanup_stored_tracker_data",
            side_effect=RuntimeError("database unavailable"),
        ):
            with self.assertRaisesRegex(RuntimeError, "database unavailable"):
                maintenance.main(["cleanup-legacy"])


if __name__ == "__main__":
    unittest.main()
