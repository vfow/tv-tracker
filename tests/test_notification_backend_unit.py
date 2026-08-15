import unittest

from notifications_backend import mark_notification_read


class FakeCursor:
    def __init__(self, rowcount):
        self.rowcount = rowcount
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, query, params=None):
        self.calls.append((query, params))


class FakeConnection:
    def __init__(self, rowcount):
        self.cursor_instance = FakeCursor(rowcount)
        self.commits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        self.commits += 1


class NotificationBackendUnitTests(unittest.TestCase):
    def test_mark_notification_read_updates_one_row(self):
        connection = FakeConnection(1)
        changed = mark_notification_read(lambda: connection, 42)
        self.assertTrue(changed)
        self.assertEqual(connection.commits, 1)
        query, params = connection.cursor_instance.calls[0]
        self.assertIn("is_read = TRUE", query)
        self.assertEqual(params, (42,))

    def test_mark_notification_read_returns_false_for_missing_row(self):
        connection = FakeConnection(0)
        self.assertFalse(mark_notification_read(lambda: connection, 999))
        self.assertEqual(connection.commits, 1)


if __name__ == "__main__":
    unittest.main()
