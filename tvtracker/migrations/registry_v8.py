from __future__ import annotations

from .registry_v7 import MIGRATIONS as V7_MIGRATIONS
from .runner import SchemaContract, SqlMigration


DATABASE_SCHEMA_VERSION = 8

_V7_CONTRACT = V7_MIGRATIONS[-1].schema_contract
if _V7_CONTRACT is None or _V7_CONTRACT.schema_version != 7:
    raise RuntimeError("The Phase 4 migration requires the canonical v7 schema contract")

_ACCOUNT_TOKEN_SQL = """
CREATE TABLE IF NOT EXISTS tv_tracker_account_tokens (
    token_id UUID CONSTRAINT tv_tracker_account_tokens_pkey PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES tv_tracker_users(user_id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    pending_email TEXT,
    pending_email_normalized TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tv_tracker_account_tokens_token_hash_key UNIQUE (token_hash),
    CONSTRAINT tv_tracker_account_tokens_purpose_check CHECK (
        purpose IN ('verify_email', 'password_reset', 'email_change')
    ),
    CONSTRAINT tv_tracker_account_tokens_email_change_check CHECK (
        (
            purpose = 'email_change'
            AND pending_email IS NOT NULL
            AND pending_email_normalized IS NOT NULL
            AND pending_email = btrim(pending_email)
            AND pending_email_normalized = lower(pending_email)
        )
        OR (
            purpose <> 'email_change'
            AND pending_email IS NULL
            AND pending_email_normalized IS NULL
        )
    ),
    CONSTRAINT tv_tracker_account_tokens_expiry_check CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS tv_tracker_account_tokens_user_purpose_idx
ON tv_tracker_account_tokens (user_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS tv_tracker_account_tokens_expiry_idx
ON tv_tracker_account_tokens (expires_at)
WHERE used_at IS NULL;
"""

_CURRENT_SCHEMA_VALIDATION_SQL = f"""
WITH phase7_issues(issue) AS (
{_V7_CONTRACT.validation_sql}
),
account_token_relation AS (
    SELECT relation.oid
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = current_schema()
      AND relation.relname = 'tv_tracker_account_tokens'
      AND relation.relkind = 'r'
),
expected_columns(column_name, data_type, not_null) AS (
    VALUES
        ('token_id', 'uuid', true),
        ('user_id', 'uuid', true),
        ('purpose', 'text', true),
        ('token_hash', 'text', true),
        ('pending_email', 'text', false),
        ('pending_email_normalized', 'text', false),
        ('expires_at', 'timestamp with time zone', true),
        ('used_at', 'timestamp with time zone', false),
        ('created_at', 'timestamp with time zone', true)
),
actual_columns AS (
    SELECT attribute.attname AS column_name,
           pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
           attribute.attnotnull AS not_null
    FROM account_token_relation
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = account_token_relation.oid
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
),
column_issues(issue) AS (
    SELECT format('missing column on tv_tracker_account_tokens: %I', expected.column_name)
    FROM expected_columns AS expected
    LEFT JOIN actual_columns AS actual USING (column_name)
    WHERE actual.column_name IS NULL

    UNION ALL

    SELECT format('unexpected column on tv_tracker_account_tokens: %I', actual.column_name)
    FROM actual_columns AS actual
    LEFT JOIN expected_columns AS expected USING (column_name)
    WHERE expected.column_name IS NULL

    UNION ALL

    SELECT format('column on tv_tracker_account_tokens differs: %I', expected.column_name)
    FROM expected_columns AS expected
    JOIN actual_columns AS actual USING (column_name)
    WHERE actual.data_type <> expected.data_type
       OR actual.not_null <> expected.not_null
),
expected_constraints(constraint_name, constraint_type) AS (
    VALUES
        ('tv_tracker_account_tokens_pkey', 'p'),
        ('tv_tracker_account_tokens_token_hash_key', 'u'),
        ('tv_tracker_account_tokens_purpose_check', 'c'),
        ('tv_tracker_account_tokens_email_change_check', 'c'),
        ('tv_tracker_account_tokens_expiry_check', 'c'),
        ('tv_tracker_account_tokens_user_id_fkey', 'f')
),
actual_constraints AS (
    SELECT constraint_row.conname AS constraint_name,
           constraint_row.contype::text AS constraint_type,
           constraint_row.convalidated AS validated
    FROM account_token_relation
    JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid = account_token_relation.oid
),
constraint_issues(issue) AS (
    SELECT format('missing constraint on tv_tracker_account_tokens: %I', expected.constraint_name)
    FROM expected_constraints AS expected
    LEFT JOIN actual_constraints AS actual USING (constraint_name)
    WHERE actual.constraint_name IS NULL

    UNION ALL

    SELECT format('constraint on tv_tracker_account_tokens differs: %I', expected.constraint_name)
    FROM expected_constraints AS expected
    JOIN actual_constraints AS actual USING (constraint_name)
    WHERE actual.constraint_type <> expected.constraint_type
       OR NOT actual.validated
),
index_issues(issue) AS (
    SELECT 'missing index tv_tracker_account_tokens_user_purpose_idx'
    WHERE to_regclass('tv_tracker_account_tokens_user_purpose_idx') IS NULL

    UNION ALL

    SELECT 'missing index tv_tracker_account_tokens_expiry_idx'
    WHERE to_regclass('tv_tracker_account_tokens_expiry_idx') IS NULL
),
relation_issues(issue) AS (
    SELECT 'missing relation tv_tracker_account_tokens'
    WHERE NOT EXISTS (SELECT 1 FROM account_token_relation)
)
SELECT issue FROM phase7_issues
UNION ALL
SELECT issue FROM relation_issues
UNION ALL
SELECT issue FROM column_issues
UNION ALL
SELECT issue FROM constraint_issues
UNION ALL
SELECT issue FROM index_issues
ORDER BY issue
"""

_ACCOUNT_TOKEN_MIGRATION = SqlMigration(
    "0008_account_creation_email_tokens",
    _ACCOUNT_TOKEN_SQL,
    schema_contract=SchemaContract(
        schema_version=DATABASE_SCHEMA_VERSION,
        managed_relations=_V7_CONTRACT.managed_relations + ("tv_tracker_account_tokens",),
        validation_sql=_CURRENT_SCHEMA_VALIDATION_SQL,
        legacy_schema_versions=(4, 5, 6, 7),
        adoption_seed_sql=_V7_CONTRACT.adoption_seed_sql,
    ),
)

MIGRATIONS: tuple[SqlMigration, ...] = tuple(
    SqlMigration(migration.migration_id, migration.sql)
    for migration in V7_MIGRATIONS
) + (_ACCOUNT_TOKEN_MIGRATION,)

if int(MIGRATIONS[-1].migration_id.split("_", 1)[0]) != DATABASE_SCHEMA_VERSION:
    raise RuntimeError("Database schema version must match the latest migration ID")
