import unittest
from unittest.mock import MagicMock

from tvtracker.migrations.runner import SchemaContract, SqlMigration
from tvtracker.migrations.verification import verify_migrations_current


VALIDATION_SQL = "SELECT NULL::text WHERE FALSE"


def registry():
    return (
        SqlMigration(
            "0001_test_schema",
            "SELECT 1",
            schema_contract=SchemaContract(
                schema_version=1,
                managed_relations=("tv_tracker_schema_meta",),
                validation_sql=VALIDATION_SQL,
            ),
        ),
    )


def connection_for(migrations, *, ledger_rows=None, schema_version=1, issues=None):
    connection = MagicMock()
    connection.__enter__.return_value = connection
    cursor = MagicMock()
    connection.cursor.return_value.__enter__.return_value = cursor
    current_row = None
    current_rows = []

    migration = migrations[0]
    expected_ledger = [(migration.migration_id, migration.checksum)]

    def execute(sql, params=None):
        nonlocal current_row, current_rows
        statement = str(sql)
        current_row = None
        current_rows = []

        if "to_regclass('tv_tracker_migrations')" in statement:
            current_row = ("tv_tracker_migrations",)
        elif "SELECT migration_id, checksum FROM tv_tracker_migrations" in statement:
            current_rows = expected_ledger if ledger_rows is None else list(ledger_rows)
        elif "to_regclass('tv_tracker_schema_meta')" in statement:
            current_row = ("tv_tracker_schema_meta",)
        elif "SELECT schema_version FROM tv_tracker_schema_meta" in statement:
            current_row = (schema_version,)
        elif statement == VALIDATION_SQL:
            current_rows = list(issues or [])

    cursor.execute.side_effect = execute
    cursor.fetchone.side_effect = lambda: current_row
    cursor.fetchall.side_effect = lambda: list(current_rows)
    return connection


class MigrationVerificationTests(unittest.TestCase):
    def test_accepts_complete_checksum_valid_schema(self):
        migrations = registry()
        connection = connection_for(migrations)

        verify_migrations_current(lambda: connection, migrations)

    def test_rejects_pending_migration_without_applying_it(self):
        migrations = registry()
        connection = connection_for(migrations, ledger_rows=[])

        with self.assertRaisesRegex(RuntimeError, "pending migrations"):
            verify_migrations_current(lambda: connection, migrations)

        statements = [call.args[0] for call in connection.cursor.return_value.__enter__.return_value.execute.call_args_list]
        self.assertFalse(any("INSERT INTO tv_tracker_migrations" in str(statement) for statement in statements))

    def test_rejects_schema_drift(self):
        migrations = registry()
        connection = connection_for(migrations, issues=[("missing index",)])

        with self.assertRaisesRegex(RuntimeError, "schema drift"):
            verify_migrations_current(lambda: connection, migrations)


if __name__ == "__main__":
    unittest.main()
