from __future__ import annotations

from .registry import MIGRATIONS as V6_MIGRATIONS
from .runner import SchemaContract, SqlMigration


DATABASE_SCHEMA_VERSION = 7

_OWNER_SCOPED_RELATIONS = (
    ("tv_tracker_shows", "tv_tracker_shows_user_idx", "user_id, show_id"),
    ("tv_tracker_history", "tv_tracker_history_user_idx", "user_id, entry_id"),
    ("tv_tracker_state", "tv_tracker_state_user_idx", "user_id, state_key"),
    ("tv_tracker_meta", "tv_tracker_meta_user_idx", "user_id"),
    ("tv_tracker_changes", "tv_tracker_changes_user_idx", "user_id, revision"),
    (
        "tv_tracker_notification_settings",
        "tv_tracker_notification_settings_user_idx",
        "user_id",
    ),
    (
        "tv_tracker_notification_baseline",
        "tv_tracker_notification_baseline_user_idx",
        "user_id, show_id",
    ),
    (
        "tv_tracker_notification_events",
        "tv_tracker_notification_events_user_idx",
        "user_id, event_key",
    ),
    (
        "tv_tracker_notifications",
        "tv_tracker_notifications_user_idx",
        "user_id, created_at DESC",
    ),
    (
        "tv_tracker_final_notification_settings",
        "tv_tracker_final_notification_settings_user_idx",
        "user_id",
    ),
    (
        "tv_tracker_movie_notification_baseline",
        "tv_tracker_movie_notification_baseline_user_idx",
        "user_id, movie_id",
    ),
    (
        "tv_tracker_push_subscriptions",
        "tv_tracker_push_subscriptions_user_idx",
        "user_id, device_id",
    ),
    (
        "tv_tracker_push_presence",
        "tv_tracker_push_presence_user_idx",
        "user_id, device_id, client_id",
    ),
    (
        "tv_tracker_push_deliveries",
        "tv_tracker_push_deliveries_user_idx",
        "user_id, status, next_attempt_at",
    ),
    (
        "tv_tracker_security_events",
        "tv_tracker_security_events_user_idx",
        "user_id, event_type, created_at",
    ),
)

_V6_CONTRACT = V6_MIGRATIONS[-1].schema_contract
if _V6_CONTRACT is None or _V6_CONTRACT.schema_version != 6:
    raise RuntimeError("The Phase 2 migration requires the canonical v6 schema contract")

# The v6 validator intentionally rejects unexpected columns. Phase 2 adds one
# nullable ownership scaffold column to selected v6 tables while preserving all
# of the v6 column/constraint/index checks. The new user table and ownership
# additions are then validated explicitly below.
_UNEXPECTED_COLUMN_MARKER = "    WHERE expected.column_name IS NULL\n\n    UNION ALL\n"
if _V6_CONTRACT.validation_sql.count(_UNEXPECTED_COLUMN_MARKER) != 1:
    raise RuntimeError("The v6 schema validator shape changed unexpectedly")
_V6_VALIDATION_WITH_OWNER_COLUMNS = _V6_CONTRACT.validation_sql.replace(
    _UNEXPECTED_COLUMN_MARKER,
    "    WHERE expected.column_name IS NULL\n"
    "      AND actual.column_name <> 'user_id'\n\n"
    "    UNION ALL\n",
    1,
)

_OWNER_VALUES_SQL = ",\n        ".join(
    f"('{table_name}', '{index_name}')"
    for table_name, index_name, _key_definition in _OWNER_SCOPED_RELATIONS
)

_CURRENT_SCHEMA_VALIDATION_SQL = f"""
WITH base_issues AS (
{_V6_VALIDATION_WITH_OWNER_COLUMNS}
),
expected_owner_relations(table_name, index_name) AS (
    VALUES
        {_OWNER_VALUES_SQL}
),
actual_owner_columns AS (
    SELECT expected.table_name,
           attribute.attname AS column_name,
           pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
           attribute.attnotnull AS not_null,
           attribute.attidentity AS identity_kind,
           attribute.attgenerated AS generated_kind,
           attribute_default.oid IS NOT NULL AS has_default
    FROM expected_owner_relations AS expected
    LEFT JOIN pg_catalog.pg_class AS relation
      ON relation.relname = expected.table_name
    LEFT JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
     AND namespace.nspname = current_schema()
    LEFT JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attname = 'user_id'
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef AS attribute_default
      ON attribute_default.adrelid = attribute.attrelid
     AND attribute_default.adnum = attribute.attnum
    WHERE namespace.oid IS NOT NULL
),
ownership_column_issues(issue) AS (
    SELECT format('missing ownership column %I.user_id', expected.table_name)
    FROM expected_owner_relations AS expected
    LEFT JOIN actual_owner_columns AS actual USING (table_name)
    WHERE actual.column_name IS NULL

    UNION ALL

    SELECT format(
        'ownership column %I.user_id must be nullable UUID with no default',
        actual.table_name
    )
    FROM actual_owner_columns AS actual
    WHERE actual.column_name IS NOT NULL
      AND (
          actual.data_type <> 'uuid'
          OR actual.not_null
          OR actual.has_default
          OR actual.identity_kind <> ''
          OR actual.generated_kind <> ''
      )
),
ownership_index_issues(issue) AS (
    SELECT format('missing ownership index %I', expected.index_name)
    FROM expected_owner_relations AS expected
    WHERE to_regclass(expected.index_name) IS NULL
),
user_relation AS (
    SELECT relation.oid,
           relation.relkind,
           relation.relpersistence,
           relation.relispartition
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = current_schema()
      AND relation.relname = 'tv_tracker_users'
),
user_table_issues(issue) AS (
    SELECT 'missing table tv_tracker_users'
    WHERE NOT EXISTS (SELECT 1 FROM user_relation)

    UNION ALL

    SELECT 'relation tv_tracker_users must be an ordinary permanent table'
    FROM user_relation
    WHERE relkind <> 'r'
       OR relpersistence <> 'p'
       OR relispartition
),
expected_user_columns(column_name, data_type, not_null) AS (
    VALUES
        ('user_id', 'uuid', TRUE),
        ('email', 'text', TRUE),
        ('email_normalized', 'text', TRUE),
        ('username', 'text', TRUE),
        ('username_normalized', 'text', TRUE),
        ('password_hash', 'text', TRUE),
        ('role', 'text', TRUE),
        ('status', 'text', TRUE),
        ('email_verified_at', 'timestamp with time zone', FALSE),
        ('session_version', 'bigint', TRUE),
        ('deletion_requested_at', 'timestamp with time zone', FALSE),
        ('deletion_due_at', 'timestamp with time zone', FALSE),
        ('created_at', 'timestamp with time zone', TRUE),
        ('updated_at', 'timestamp with time zone', TRUE)
),
actual_user_columns AS (
    SELECT attribute.attname AS column_name,
           pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
           attribute.attnotnull AS not_null,
           attribute.attidentity AS identity_kind,
           attribute.attgenerated AS generated_kind
    FROM user_relation
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = user_relation.oid
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
),
user_column_issues(issue) AS (
    SELECT format('missing column tv_tracker_users.%I', expected.column_name)
    FROM expected_user_columns AS expected
    LEFT JOIN actual_user_columns AS actual USING (column_name)
    WHERE actual.column_name IS NULL

    UNION ALL

    SELECT format('unexpected column tv_tracker_users.%I', actual.column_name)
    FROM actual_user_columns AS actual
    LEFT JOIN expected_user_columns AS expected USING (column_name)
    WHERE expected.column_name IS NULL

    UNION ALL

    SELECT format(
        'column tv_tracker_users.%I differs (expected type=%s, not_null=%s; found type=%s, not_null=%s)',
        expected.column_name,
        expected.data_type,
        expected.not_null,
        actual.data_type,
        actual.not_null
    )
    FROM expected_user_columns AS expected
    JOIN actual_user_columns AS actual USING (column_name)
    WHERE actual.data_type <> expected.data_type
       OR actual.not_null <> expected.not_null
       OR actual.identity_kind <> ''
       OR actual.generated_kind <> ''
),
expected_user_constraints(constraint_name, constraint_type) AS (
    VALUES
        ('tv_tracker_users_pkey', 'p'),
        ('tv_tracker_users_email_normalized_key', 'u'),
        ('tv_tracker_users_username_normalized_key', 'u'),
        ('tv_tracker_users_role_check', 'c'),
        ('tv_tracker_users_status_check', 'c'),
        ('tv_tracker_users_username_check', 'c'),
        ('tv_tracker_users_username_normalized_check', 'c'),
        ('tv_tracker_users_email_trimmed_check', 'c'),
        ('tv_tracker_users_email_normalized_check', 'c'),
        ('tv_tracker_users_session_version_check', 'c'),
        ('tv_tracker_users_deletion_window_check', 'c')
),
actual_user_constraints AS (
    SELECT constraint_row.conname AS constraint_name,
           constraint_row.contype::text AS constraint_type,
           constraint_row.convalidated
               AND NOT constraint_row.condeferrable
               AND NOT constraint_row.condeferred
               AND NOT constraint_row.connoinherit AS healthy
    FROM user_relation
    JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid = user_relation.oid
     AND constraint_row.contype IN ('p', 'u', 'c')
),
user_constraint_issues(issue) AS (
    SELECT format('missing constraint on tv_tracker_users: %I', expected.constraint_name)
    FROM expected_user_constraints AS expected
    LEFT JOIN actual_user_constraints AS actual USING (constraint_name)
    WHERE actual.constraint_name IS NULL

    UNION ALL

    SELECT format('unexpected constraint on tv_tracker_users: %I', actual.constraint_name)
    FROM actual_user_constraints AS actual
    LEFT JOIN expected_user_constraints AS expected USING (constraint_name)
    WHERE expected.constraint_name IS NULL

    UNION ALL

    SELECT format(
        'constraint on tv_tracker_users differs or is not validated: %I',
        expected.constraint_name
    )
    FROM expected_user_constraints AS expected
    JOIN actual_user_constraints AS actual USING (constraint_name)
    WHERE actual.constraint_type <> expected.constraint_type
       OR NOT actual.healthy
),
user_index_issues(issue) AS (
    SELECT 'missing index tv_tracker_users_deletion_due_idx'
    WHERE to_regclass('tv_tracker_users_deletion_due_idx') IS NULL
)
SELECT issue FROM base_issues
UNION ALL
SELECT issue FROM ownership_column_issues
UNION ALL
SELECT issue FROM ownership_index_issues
UNION ALL
SELECT issue FROM user_table_issues
UNION ALL
SELECT issue FROM user_column_issues
UNION ALL
SELECT issue FROM user_constraint_issues
UNION ALL
SELECT issue FROM user_index_issues
ORDER BY issue
"""

_MULTI_USER_FOUNDATION_SQL = """
CREATE TABLE IF NOT EXISTS tv_tracker_users (
    user_id UUID CONSTRAINT tv_tracker_users_pkey PRIMARY KEY,
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL,
    username TEXT NOT NULL,
    username_normalized TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'unverified',
    email_verified_at TIMESTAMPTZ,
    session_version BIGINT NOT NULL DEFAULT 1,
    deletion_requested_at TIMESTAMPTZ,
    deletion_due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tv_tracker_users_email_normalized_key UNIQUE (email_normalized),
    CONSTRAINT tv_tracker_users_username_normalized_key UNIQUE (username_normalized),
    CONSTRAINT tv_tracker_users_role_check CHECK (role IN ('user', 'admin')),
    CONSTRAINT tv_tracker_users_status_check CHECK (
        status IN ('unverified', 'active', 'deactivated', 'pending_deletion')
    ),
    CONSTRAINT tv_tracker_users_username_check CHECK (
        username ~ '^[A-Za-z0-9_]{3,30}$'
    ),
    CONSTRAINT tv_tracker_users_username_normalized_check CHECK (
        username_normalized = lower(username)
    ),
    CONSTRAINT tv_tracker_users_email_trimmed_check CHECK (email = btrim(email)),
    CONSTRAINT tv_tracker_users_email_normalized_check CHECK (
        email_normalized = lower(email)
    ),
    CONSTRAINT tv_tracker_users_session_version_check CHECK (session_version >= 1),
    CONSTRAINT tv_tracker_users_deletion_window_check CHECK (
        (deletion_requested_at IS NULL AND deletion_due_at IS NULL)
        OR (
            deletion_requested_at IS NOT NULL
            AND deletion_due_at IS NOT NULL
            AND deletion_due_at > deletion_requested_at
        )
    )
);

CREATE INDEX IF NOT EXISTS tv_tracker_users_deletion_due_idx
ON tv_tracker_users (status, deletion_due_at);

ALTER TABLE tv_tracker_shows ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE tv_tracker_history ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE tv_tracker_state ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE tv_tracker_meta ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE tv_tracker_changes ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE tv_tracker_notification_settings ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE tv_tracker_notification_baseline ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE tv_tracker_notification_events ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE tv_tracker_notifications ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE tv_tracker_final_notification_settings ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE tv_tracker_movie_notification_baseline ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE tv_tracker_push_subscriptions ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE tv_tracker_push_presence ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE tv_tracker_push_deliveries ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE tv_tracker_security_events ADD COLUMN IF NOT EXISTS user_id UUID;

CREATE INDEX IF NOT EXISTS tv_tracker_shows_user_idx
ON tv_tracker_shows (user_id, show_id);
CREATE INDEX IF NOT EXISTS tv_tracker_history_user_idx
ON tv_tracker_history (user_id, entry_id);
CREATE INDEX IF NOT EXISTS tv_tracker_state_user_idx
ON tv_tracker_state (user_id, state_key);
CREATE INDEX IF NOT EXISTS tv_tracker_meta_user_idx
ON tv_tracker_meta (user_id);
CREATE INDEX IF NOT EXISTS tv_tracker_changes_user_idx
ON tv_tracker_changes (user_id, revision);
CREATE INDEX IF NOT EXISTS tv_tracker_notification_settings_user_idx
ON tv_tracker_notification_settings (user_id);
CREATE INDEX IF NOT EXISTS tv_tracker_notification_baseline_user_idx
ON tv_tracker_notification_baseline (user_id, show_id);
CREATE INDEX IF NOT EXISTS tv_tracker_notification_events_user_idx
ON tv_tracker_notification_events (user_id, event_key);
CREATE INDEX IF NOT EXISTS tv_tracker_notifications_user_idx
ON tv_tracker_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tv_tracker_final_notification_settings_user_idx
ON tv_tracker_final_notification_settings (user_id);
CREATE INDEX IF NOT EXISTS tv_tracker_movie_notification_baseline_user_idx
ON tv_tracker_movie_notification_baseline (user_id, movie_id);
CREATE INDEX IF NOT EXISTS tv_tracker_push_subscriptions_user_idx
ON tv_tracker_push_subscriptions (user_id, device_id);
CREATE INDEX IF NOT EXISTS tv_tracker_push_presence_user_idx
ON tv_tracker_push_presence (user_id, device_id, client_id);
CREATE INDEX IF NOT EXISTS tv_tracker_push_deliveries_user_idx
ON tv_tracker_push_deliveries (user_id, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS tv_tracker_security_events_user_idx
ON tv_tracker_security_events (user_id, event_type, created_at);
"""

_MULTI_USER_FOUNDATION_MIGRATION = SqlMigration(
    "0007_multi_user_database_foundation",
    _MULTI_USER_FOUNDATION_SQL,
    schema_contract=SchemaContract(
        schema_version=DATABASE_SCHEMA_VERSION,
        managed_relations=_V6_CONTRACT.managed_relations + ("tv_tracker_users",),
        validation_sql=_CURRENT_SCHEMA_VALIDATION_SQL,
        legacy_schema_versions=(4, 5, 6),
        adoption_seed_sql=_V6_CONTRACT.adoption_seed_sql,
    ),
)

# Rebuild the historical v1-v6 migration objects without their old latest-only
# schema contract. Their SQL and checksums remain byte-for-byte identical.
MIGRATIONS: tuple[SqlMigration, ...] = tuple(
    SqlMigration(migration.migration_id, migration.sql)
    for migration in V6_MIGRATIONS
) + (_MULTI_USER_FOUNDATION_MIGRATION,)

if int(MIGRATIONS[-1].migration_id.split("_", 1)[0]) != DATABASE_SCHEMA_VERSION:
    raise RuntimeError("Database schema version must match the latest migration ID")
