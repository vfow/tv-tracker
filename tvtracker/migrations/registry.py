from __future__ import annotations

from .runner import SchemaContract, SqlMigration
from .versions import DATABASE_SCHEMA_VERSION


_MANAGED_RELATIONS = (
    "tv_tracker_admin",
    "tv_tracker_changes",
    "tv_tracker_final_notification_settings",
    "tv_tracker_history",
    "tv_tracker_meta",
    "tv_tracker_movie_notification_baseline",
    "tv_tracker_notification_baseline",
    "tv_tracker_notification_events",
    "tv_tracker_notification_settings",
    "tv_tracker_notifications",
    "tv_tracker_push_deliveries",
    "tv_tracker_push_presence",
    "tv_tracker_push_subscriptions",
    "tv_tracker_schema_meta",
    "tv_tracker_security_events",
    "tv_tracker_shows",
    "tv_tracker_state",
)

# Version 4 is the only behind version ever written to schema_meta before the
# migration ledger existed. Adoption still requires the complete v5 contract.
_LEGACY_SCHEMA_VERSIONS = (4,)


_CURRENT_SCHEMA_VALIDATION_SQL = """
WITH
expected_tables(table_name) AS (
    VALUES
        ('tv_tracker_migrations'),
        ('tv_tracker_shows'),
        ('tv_tracker_history'),
        ('tv_tracker_state'),
        ('tv_tracker_meta'),
        ('tv_tracker_changes'),
        ('tv_tracker_admin'),
        ('tv_tracker_security_events'),
        ('tv_tracker_schema_meta'),
        ('tv_tracker_notification_settings'),
        ('tv_tracker_notification_baseline'),
        ('tv_tracker_notification_events'),
        ('tv_tracker_notifications'),
        ('tv_tracker_final_notification_settings'),
        ('tv_tracker_movie_notification_baseline'),
        ('tv_tracker_push_subscriptions'),
        ('tv_tracker_push_presence'),
        ('tv_tracker_push_deliveries')
),
actual_tables AS (
    SELECT relation.oid AS table_oid,
           relation.relname AS table_name,
           relation.relkind,
           relation.relpersistence,
           relation.relispartition
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN expected_tables AS expected
      ON expected.table_name = relation.relname
    WHERE namespace.nspname = current_schema()
),
table_issues(issue) AS (
    SELECT format('missing table %I', expected.table_name)
    FROM expected_tables AS expected
    LEFT JOIN actual_tables AS actual USING (table_name)
    WHERE actual.table_oid IS NULL

    UNION ALL

    SELECT format(
        'relation %I must be an ordinary permanent table',
        actual.table_name
    )
    FROM actual_tables AS actual
    WHERE actual.relkind <> 'r'
       OR actual.relpersistence <> 'p'
       OR actual.relispartition
),
expected_columns(
    table_name,
    column_name,
    data_type,
    not_null,
    default_signature
) AS (
    VALUES
        ('tv_tracker_migrations', 'migration_id', 'text', TRUE, NULL),
        ('tv_tracker_migrations', 'checksum', 'text', TRUE, NULL),
        ('tv_tracker_migrations', 'applied_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_shows', 'show_id', 'text', TRUE, NULL),
        ('tv_tracker_shows', 'data', 'jsonb', TRUE, NULL),
        ('tv_tracker_shows', 'updated_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_history', 'entry_id', 'text', TRUE, NULL),
        ('tv_tracker_history', 'data', 'jsonb', TRUE, NULL),
        ('tv_tracker_history', 'updated_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_state', 'state_key', 'text', TRUE, NULL),
        ('tv_tracker_state', 'data', 'jsonb', FALSE, NULL),
        ('tv_tracker_state', 'updated_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_meta', 'singleton_id', 'smallint', TRUE, NULL),
        ('tv_tracker_meta', 'revision', 'bigint', TRUE, '0'),
        ('tv_tracker_meta', 'updated_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_changes', 'revision', 'bigint', TRUE, NULL),
        ('tv_tracker_changes', 'operation_id', 'text', TRUE, NULL),
        ('tv_tracker_changes', 'delta', 'jsonb', TRUE, NULL),
        ('tv_tracker_changes', 'created_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_admin', 'singleton_id', 'smallint', TRUE, NULL),
        ('tv_tracker_admin', 'username', 'text', TRUE, NULL),
        ('tv_tracker_admin', 'password_hash', 'text', TRUE, NULL),
        ('tv_tracker_admin', 'session_version', 'bigint', TRUE, '1'),
        ('tv_tracker_admin', 'updated_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_security_events', 'event_id', 'bigint', TRUE, 'sequence:tv_tracker_security_events_event_id_seq'),
        ('tv_tracker_security_events', 'event_type', 'text', TRUE, NULL),
        ('tv_tracker_security_events', 'client_key', 'text', TRUE, NULL),
        ('tv_tracker_security_events', 'created_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_schema_meta', 'singleton_id', 'smallint', TRUE, NULL),
        ('tv_tracker_schema_meta', 'schema_version', 'integer', TRUE, NULL),
        ('tv_tracker_schema_meta', 'updated_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_notification_settings', 'singleton_id', 'smallint', TRUE, NULL),
        ('tv_tracker_notification_settings', 'enabled', 'boolean', TRUE, 'true'),
        ('tv_tracker_notification_settings', 'timezone', 'text', TRUE, ''''''),
        ('tv_tracker_notification_settings', 'new_season', 'boolean', TRUE, 'true'),
        ('tv_tracker_notification_settings', 'season_premiere_tomorrow', 'boolean', TRUE, 'true'),
        ('tv_tracker_notification_settings', 'new_episode', 'boolean', TRUE, 'true'),
        ('tv_tracker_notification_settings', 'returns_tomorrow', 'boolean', TRUE, 'true'),
        ('tv_tracker_notification_settings', 'canceled_ended', 'boolean', TRUE, 'true'),
        ('tv_tracker_notification_settings', 'premiere_date_updates', 'boolean', TRUE, 'true'),
        ('tv_tracker_notification_settings', 'initialized_at', 'timestamp with time zone', FALSE, NULL),
        ('tv_tracker_notification_settings', 'last_checked_at', 'timestamp with time zone', FALSE, NULL),
        ('tv_tracker_notification_settings', 'updated_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_notification_settings', 'timezone_mode', 'text', TRUE, '''automatic'''),
        ('tv_tracker_notification_baseline', 'show_id', 'text', TRUE, NULL),
        ('tv_tracker_notification_baseline', 'snapshot', 'jsonb', TRUE, NULL),
        ('tv_tracker_notification_baseline', 'updated_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_notification_events', 'event_key', 'text', TRUE, NULL),
        ('tv_tracker_notification_events', 'show_id', 'text', TRUE, NULL),
        ('tv_tracker_notification_events', 'event_type', 'text', TRUE, NULL),
        ('tv_tracker_notification_events', 'observed_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_notifications', 'notification_id', 'bigint', TRUE, 'sequence:tv_tracker_notifications_notification_id_seq'),
        ('tv_tracker_notifications', 'group_key', 'text', TRUE, NULL),
        ('tv_tracker_notifications', 'event_key', 'text', TRUE, NULL),
        ('tv_tracker_notifications', 'notification_type', 'text', TRUE, NULL),
        ('tv_tracker_notifications', 'show_id', 'text', TRUE, NULL),
        ('tv_tracker_notifications', 'title', 'text', TRUE, NULL),
        ('tv_tracker_notifications', 'message', 'text', TRUE, NULL),
        ('tv_tracker_notifications', 'image_path', 'text', TRUE, ''''''),
        ('tv_tracker_notifications', 'event_date', 'date', FALSE, NULL),
        ('tv_tracker_notifications', 'is_read', 'boolean', TRUE, 'false'),
        ('tv_tracker_notifications', 'payload', 'jsonb', TRUE, '''{}'''),
        ('tv_tracker_notifications', 'created_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_notifications', 'updated_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_notifications', 'media_type', 'text', TRUE, '''tv'''),
        ('tv_tracker_final_notification_settings', 'singleton_id', 'smallint', TRUE, NULL),
        ('tv_tracker_final_notification_settings', 'movie_released', 'boolean', TRUE, 'true'),
        ('tv_tracker_final_notification_settings', 'movie_release_updates', 'boolean', TRUE, 'true'),
        ('tv_tracker_final_notification_settings', 'updated_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_movie_notification_baseline', 'movie_id', 'text', TRUE, NULL),
        ('tv_tracker_movie_notification_baseline', 'region', 'text', TRUE, NULL),
        ('tv_tracker_movie_notification_baseline', 'snapshot', 'jsonb', TRUE, NULL),
        ('tv_tracker_movie_notification_baseline', 'updated_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_push_subscriptions', 'subscription_id', 'bigint', TRUE, 'sequence:tv_tracker_push_subscriptions_subscription_id_seq'),
        ('tv_tracker_push_subscriptions', 'device_id', 'text', TRUE, NULL),
        ('tv_tracker_push_subscriptions', 'endpoint', 'text', TRUE, NULL),
        ('tv_tracker_push_subscriptions', 'p256dh', 'text', TRUE, NULL),
        ('tv_tracker_push_subscriptions', 'auth', 'text', TRUE, NULL),
        ('tv_tracker_push_subscriptions', 'user_agent', 'text', TRUE, ''''''),
        ('tv_tracker_push_subscriptions', 'created_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_push_subscriptions', 'updated_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_push_subscriptions', 'last_success_at', 'timestamp with time zone', FALSE, NULL),
        ('tv_tracker_push_subscriptions', 'failure_count', 'integer', TRUE, '0'),
        ('tv_tracker_push_subscriptions', 'session_version', 'bigint', TRUE, '0'),
        ('tv_tracker_push_presence', 'device_id', 'text', TRUE, NULL),
        ('tv_tracker_push_presence', 'client_id', 'text', TRUE, NULL),
        ('tv_tracker_push_presence', 'visible', 'boolean', TRUE, 'false'),
        ('tv_tracker_push_presence', 'last_seen_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_push_deliveries', 'delivery_key', 'text', TRUE, NULL),
        ('tv_tracker_push_deliveries', 'subscription_id', 'bigint', TRUE, NULL),
        ('tv_tracker_push_deliveries', 'notification_id', 'bigint', FALSE, NULL),
        ('tv_tracker_push_deliveries', 'payload', 'jsonb', TRUE, NULL),
        ('tv_tracker_push_deliveries', 'status', 'text', TRUE, '''pending'''),
        ('tv_tracker_push_deliveries', 'attempts', 'integer', TRUE, '0'),
        ('tv_tracker_push_deliveries', 'next_attempt_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_push_deliveries', 'last_error', 'text', TRUE, ''''''),
        ('tv_tracker_push_deliveries', 'created_at', 'timestamp with time zone', TRUE, 'now()'),
        ('tv_tracker_push_deliveries', 'updated_at', 'timestamp with time zone', TRUE, 'now()')
),
raw_columns AS (
    SELECT table_row.table_name,
           attribute.attname AS column_name,
           pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
           attribute.attnotnull AS not_null,
           attribute.attidentity AS identity_kind,
           attribute.attgenerated AS generated_kind,
           pg_catalog.pg_get_expr(
               attribute_default.adbin,
               attribute_default.adrelid,
               TRUE
           ) AS default_expression,
           sequence_relation.relname AS sequence_name,
           sequence_relation.oid IS NOT NULL
               AND EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_depend AS default_dependency
                   WHERE default_dependency.classid = 'pg_attrdef'::regclass
                     AND default_dependency.objid = attribute_default.oid
                     AND default_dependency.refclassid = 'pg_class'::regclass
                     AND default_dependency.refobjid = sequence_relation.oid
               ) AS default_uses_owned_sequence
    FROM actual_tables AS table_row
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = table_row.table_oid
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef AS attribute_default
      ON attribute_default.adrelid = attribute.attrelid
     AND attribute_default.adnum = attribute.attnum
    LEFT JOIN LATERAL (
        SELECT owned_sequence.oid, owned_sequence.relname
        FROM pg_catalog.pg_depend AS ownership
        JOIN pg_catalog.pg_class AS owned_sequence
          ON owned_sequence.oid = ownership.objid
         AND owned_sequence.relkind = 'S'
        WHERE ownership.classid = 'pg_class'::regclass
          AND ownership.refclassid = 'pg_class'::regclass
          AND ownership.refobjid = table_row.table_oid
          AND ownership.refobjsubid = attribute.attnum
          AND ownership.deptype IN ('a', 'i')
        LIMIT 1
    ) AS sequence_relation ON TRUE
),
normalized_columns AS (
    SELECT raw.*,
           btrim(
               regexp_replace(
                   lower(raw.default_expression),
                   '::(pg_catalog[.])?[a-z][a-z ]*',
                   '',
                   'g'
               )
           ) AS stripped_default
    FROM raw_columns AS raw
),
actual_columns AS (
    SELECT normalized.table_name,
           normalized.column_name,
           normalized.data_type,
           normalized.not_null,
           normalized.identity_kind,
           normalized.generated_kind,
           CASE
               WHEN normalized.default_expression IS NULL THEN NULL
               WHEN normalized.default_uses_owned_sequence THEN
                   'sequence:' || normalized.sequence_name
               WHEN normalized.stripped_default ~ '^''-?[0-9]+''$' THEN
                   trim(BOTH '''' FROM normalized.stripped_default)
               ELSE normalized.stripped_default
           END AS default_signature
    FROM normalized_columns AS normalized
),
column_issues(issue) AS (
    SELECT format(
        'missing column %I.%I',
        expected.table_name,
        expected.column_name
    )
    FROM expected_columns AS expected
    JOIN actual_tables AS table_row USING (table_name)
    LEFT JOIN actual_columns AS actual
      ON actual.table_name = expected.table_name
     AND actual.column_name = expected.column_name
    WHERE actual.column_name IS NULL

    UNION ALL

    SELECT format(
        'unexpected column %I.%I',
        actual.table_name,
        actual.column_name
    )
    FROM actual_columns AS actual
    LEFT JOIN expected_columns AS expected
      ON expected.table_name = actual.table_name
     AND expected.column_name = actual.column_name
    WHERE expected.column_name IS NULL

    UNION ALL

    SELECT format(
        'column %I.%I differs (expected type=%s, not_null=%s, default=%s; found type=%s, not_null=%s, default=%s)',
        expected.table_name,
        expected.column_name,
        expected.data_type,
        expected.not_null,
        coalesce(expected.default_signature, '<none>'),
        actual.data_type,
        actual.not_null,
        coalesce(actual.default_signature, '<none>')
    )
    FROM expected_columns AS expected
    JOIN actual_columns AS actual
      ON actual.table_name = expected.table_name
     AND actual.column_name = expected.column_name
    WHERE actual.data_type <> expected.data_type
       OR actual.not_null <> expected.not_null
       OR actual.default_signature IS DISTINCT FROM expected.default_signature
       OR actual.identity_kind <> ''
       OR actual.generated_kind <> ''
),
expected_constraints(table_name, signature) AS (
    VALUES
        ('tv_tracker_migrations', 'primary:migration_id'),
        ('tv_tracker_shows', 'primary:show_id'),
        ('tv_tracker_history', 'primary:entry_id'),
        ('tv_tracker_state', 'primary:state_key'),
        ('tv_tracker_meta', 'primary:singleton_id'),
        ('tv_tracker_meta', 'check:singleton_id=1'),
        ('tv_tracker_changes', 'primary:revision'),
        ('tv_tracker_changes', 'unique:operation_id'),
        ('tv_tracker_admin', 'primary:singleton_id'),
        ('tv_tracker_admin', 'check:singleton_id=1'),
        ('tv_tracker_security_events', 'primary:event_id'),
        ('tv_tracker_schema_meta', 'primary:singleton_id'),
        ('tv_tracker_schema_meta', 'check:singleton_id=1'),
        ('tv_tracker_notification_settings', 'primary:singleton_id'),
        ('tv_tracker_notification_settings', 'check:singleton_id=1'),
        ('tv_tracker_notification_baseline', 'primary:show_id'),
        ('tv_tracker_notification_events', 'primary:event_key'),
        ('tv_tracker_notifications', 'primary:notification_id'),
        ('tv_tracker_notifications', 'unique:group_key'),
        ('tv_tracker_final_notification_settings', 'primary:singleton_id'),
        ('tv_tracker_final_notification_settings', 'check:singleton_id=1'),
        ('tv_tracker_movie_notification_baseline', 'primary:movie_id'),
        ('tv_tracker_push_subscriptions', 'primary:subscription_id'),
        ('tv_tracker_push_subscriptions', 'unique:endpoint'),
        ('tv_tracker_push_presence', 'primary:device_id,client_id'),
        ('tv_tracker_push_deliveries', 'primary:delivery_key'),
        ('tv_tracker_push_deliveries', 'foreign:subscription_id->tv_tracker_push_subscriptions.subscription_id;match=s;update=a;delete=c')
),
actual_constraint_rows AS (
    SELECT table_row.table_name,
           CASE constraint_row.contype
               WHEN 'p' THEN 'primary:' || local_keys.column_names
               WHEN 'u' THEN 'unique:' || local_keys.column_names
               WHEN 'c' THEN 'check:' || regexp_replace(
                   regexp_replace(
                       lower(pg_catalog.pg_get_expr(
                           constraint_row.conbin,
                           constraint_row.conrelid,
                           TRUE
                       )),
                       '::(pg_catalog[.])?[a-z][a-z ]*',
                       '',
                       'g'
                   ),
                   '[[:space:]()]',
                   '',
                   'g'
               )
               WHEN 'f' THEN
                   'foreign:' || local_keys.column_names
                   || '->' || referenced_table.relname || '.'
                   || referenced_keys.column_names
                   || ';match=' || constraint_row.confmatchtype::text
                   || ';update=' || constraint_row.confupdtype::text
                   || ';delete=' || constraint_row.confdeltype::text
           END AS signature,
           constraint_row.convalidated
               AND NOT constraint_row.condeferrable
               AND NOT constraint_row.condeferred
               AND (
                   constraint_row.contype <> 'c'
                   OR NOT constraint_row.connoinherit
               ) AS healthy
    FROM actual_tables AS table_row
    JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid = table_row.table_oid
     AND constraint_row.contype IN ('p', 'u', 'c', 'f')
    LEFT JOIN pg_catalog.pg_class AS referenced_table
      ON referenced_table.oid = constraint_row.confrelid
    LEFT JOIN LATERAL (
        SELECT string_agg(
            attribute.attname,
            ',' ORDER BY key_column.ordinality
        ) AS column_names
        FROM unnest(constraint_row.conkey) WITH ORDINALITY
             AS key_column(attnum, ordinality)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraint_row.conrelid
         AND attribute.attnum = key_column.attnum
    ) AS local_keys ON TRUE
    LEFT JOIN LATERAL (
        SELECT string_agg(
            attribute.attname,
            ',' ORDER BY key_column.ordinality
        ) AS column_names
        FROM unnest(constraint_row.confkey) WITH ORDINALITY
             AS key_column(attnum, ordinality)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraint_row.confrelid
         AND attribute.attnum = key_column.attnum
    ) AS referenced_keys ON TRUE
),
expected_constraint_counts AS (
    SELECT expected.table_name,
           expected.signature,
           count(*) AS expected_count
    FROM expected_constraints AS expected
    GROUP BY expected.table_name, expected.signature
),
actual_constraint_counts AS (
    SELECT actual.table_name,
           actual.signature,
           count(*) AS actual_count,
           bool_and(actual.healthy) AS healthy
    FROM actual_constraint_rows AS actual
    GROUP BY actual.table_name, actual.signature
),
constraint_issues(issue) AS (
    SELECT CASE
        WHEN expected.signature IS NULL THEN format(
            'unexpected constraint on %I: %s',
            actual.table_name,
            actual.signature
        )
        WHEN actual.signature IS NULL THEN format(
            'missing constraint on %I: %s',
            expected.table_name,
            expected.signature
        )
        ELSE format(
            'constraint on %I differs or is not validated: %s',
            expected.table_name,
            expected.signature
        )
    END
    FROM expected_constraint_counts AS expected
    FULL JOIN actual_constraint_counts AS actual
      ON actual.table_name = expected.table_name
     AND actual.signature = expected.signature
    WHERE coalesce(actual.actual_count, 0) <> coalesce(expected.expected_count, 0)
       OR NOT coalesce(actual.healthy, FALSE)
),
expected_indexes(index_name, table_name, is_unique, key_definitions) AS (
    VALUES
        ('tv_tracker_changes_created_at_idx', 'tv_tracker_changes', FALSE, 'created_at'),
        ('tv_tracker_security_events_lookup_idx', 'tv_tracker_security_events', FALSE, 'event_type,client_key,created_at'),
        ('tv_tracker_notifications_created_at_idx', 'tv_tracker_notifications', FALSE, 'created_at desc'),
        ('tv_tracker_notifications_unread_idx', 'tv_tracker_notifications', FALSE, 'is_read,created_at desc'),
        ('tv_tracker_notification_events_observed_idx', 'tv_tracker_notification_events', FALSE, 'observed_at'),
        ('tv_tracker_push_subscriptions_device_idx', 'tv_tracker_push_subscriptions', TRUE, 'device_id'),
        ('tv_tracker_push_presence_active_idx', 'tv_tracker_push_presence', FALSE, 'device_id,visible,last_seen_at'),
        ('tv_tracker_push_deliveries_pending_idx', 'tv_tracker_push_deliveries', FALSE, 'status,next_attempt_at'),
        ('tv_tracker_push_deliveries_notification_idx', 'tv_tracker_push_deliveries', FALSE, 'notification_id')
),
actual_indexes AS (
    SELECT index_relation.relname AS index_name,
           indexed_relation.relname AS table_name,
           index_row.indisunique AS is_unique,
           index_keys.key_definitions,
           index_row.indisvalid
               AND index_row.indisready
               AND index_row.indislive
               AND (
                   NOT index_row.indisunique
                   OR index_row.indimmediate
               )
               AND NOT index_row.indisprimary
               AND NOT index_row.indisexclusion
               AND lower(pg_catalog.pg_get_indexdef(index_row.indexrelid)) !~
                   '[[:space:]]nulls[[:space:]]+not[[:space:]]+distinct([[:space:]]|$)'
               AND index_row.indnatts = index_row.indnkeyatts
               AND index_row.indexprs IS NULL
               AND index_row.indpred IS NULL
               AND access_method.amname = 'btree'
               AND index_relation.relkind = 'i'
               AND index_relation.relpersistence = 'p'
               AND indexed_namespace.nspname = current_schema()
               AND NOT EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_constraint AS backing_constraint
                   WHERE backing_constraint.conindid = index_row.indexrelid
               ) AS healthy
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS index_relation
      ON index_relation.oid = index_row.indexrelid
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    JOIN pg_catalog.pg_class AS indexed_relation
      ON indexed_relation.oid = index_row.indrelid
    JOIN pg_catalog.pg_namespace AS indexed_namespace
      ON indexed_namespace.oid = indexed_relation.relnamespace
    JOIN pg_catalog.pg_am AS access_method
      ON access_method.oid = index_relation.relam
    LEFT JOIN LATERAL (
        SELECT regexp_replace(
            regexp_replace(
                rtrim(
                    split_part(
                        lower(pg_catalog.pg_get_indexdef(index_row.indexrelid)),
                        ' using btree (',
                        2
                    ),
                    ')'
                ),
                '[[:space:]]+',
                ' ',
                'g'
            ),
            '[[:space:]]*,[[:space:]]*',
            ',',
            'g'
        ) AS key_definitions
    ) AS index_keys ON TRUE
    WHERE index_namespace.nspname = current_schema()
      AND index_relation.relname IN (
          SELECT expected.index_name FROM expected_indexes AS expected
      )
),
index_issues(issue) AS (
    SELECT CASE
        WHEN actual.index_name IS NULL THEN format(
            'missing index %I',
            expected.index_name
        )
        ELSE format(
            'index %I differs (expected table=%I, unique=%s, keys=%s; found table=%I, unique=%s, keys=%s)',
            expected.index_name,
            expected.table_name,
            expected.is_unique,
            expected.key_definitions,
            actual.table_name,
            actual.is_unique,
            actual.key_definitions
        )
    END
    FROM expected_indexes AS expected
    LEFT JOIN actual_indexes AS actual USING (index_name)
    WHERE actual.index_name IS NULL
       OR actual.table_name <> expected.table_name
       OR actual.is_unique <> expected.is_unique
       OR actual.key_definitions <> expected.key_definitions
       OR NOT actual.healthy
)
SELECT issue
FROM (
    SELECT issue FROM table_issues
    UNION ALL
    SELECT issue FROM column_issues
    UNION ALL
    SELECT issue FROM constraint_issues
    UNION ALL
    SELECT issue FROM index_issues
) AS validation_issues
ORDER BY issue
"""


_CURRENT_SCHEMA_ADOPTION_SEED_SQL = """
INSERT INTO tv_tracker_meta (singleton_id, revision)
VALUES (1, 0)
ON CONFLICT (singleton_id) DO NOTHING;

INSERT INTO tv_tracker_notification_settings (singleton_id)
VALUES (1)
ON CONFLICT (singleton_id) DO NOTHING;

INSERT INTO tv_tracker_final_notification_settings (singleton_id)
VALUES (1)
ON CONFLICT (singleton_id) DO NOTHING;
"""


MIGRATIONS: tuple[SqlMigration, ...] = (
    SqlMigration(
        "0001_core_schema",
        """
        CREATE TABLE IF NOT EXISTS tv_tracker_shows (
            show_id TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS tv_tracker_history (
            entry_id TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS tv_tracker_state (
            state_key TEXT PRIMARY KEY,
            data JSONB,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS tv_tracker_meta (
            singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
            revision BIGINT NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS tv_tracker_changes (
            revision BIGINT PRIMARY KEY,
            operation_id TEXT NOT NULL UNIQUE,
            delta JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS tv_tracker_admin (
            singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
            username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            session_version BIGINT NOT NULL DEFAULT 1,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS tv_tracker_security_events (
            event_id BIGSERIAL PRIMARY KEY,
            event_type TEXT NOT NULL,
            client_key TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS tv_tracker_schema_meta (
            singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
            schema_version INTEGER NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS tv_tracker_changes_created_at_idx
        ON tv_tracker_changes (created_at);

        CREATE INDEX IF NOT EXISTS tv_tracker_security_events_lookup_idx
        ON tv_tracker_security_events (event_type, client_key, created_at);

        INSERT INTO tv_tracker_meta (singleton_id, revision)
        VALUES (1, 0)
        ON CONFLICT (singleton_id) DO NOTHING;
        """,
    ),
    SqlMigration(
        "0002_notification_schema",
        """
        CREATE TABLE IF NOT EXISTS tv_tracker_notification_settings (
            singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            timezone TEXT NOT NULL DEFAULT '',
            new_season BOOLEAN NOT NULL DEFAULT TRUE,
            season_premiere_tomorrow BOOLEAN NOT NULL DEFAULT TRUE,
            new_episode BOOLEAN NOT NULL DEFAULT TRUE,
            returns_tomorrow BOOLEAN NOT NULL DEFAULT TRUE,
            canceled_ended BOOLEAN NOT NULL DEFAULT TRUE,
            premiere_date_updates BOOLEAN NOT NULL DEFAULT TRUE,
            initialized_at TIMESTAMPTZ,
            last_checked_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS tv_tracker_notification_baseline (
            show_id TEXT PRIMARY KEY,
            snapshot JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS tv_tracker_notification_events (
            event_key TEXT PRIMARY KEY,
            show_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS tv_tracker_notifications (
            notification_id BIGSERIAL PRIMARY KEY,
            group_key TEXT NOT NULL UNIQUE,
            event_key TEXT NOT NULL,
            notification_type TEXT NOT NULL,
            show_id TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            image_path TEXT NOT NULL DEFAULT '',
            event_date DATE,
            is_read BOOLEAN NOT NULL DEFAULT FALSE,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS tv_tracker_notifications_created_at_idx
        ON tv_tracker_notifications (created_at DESC);

        CREATE INDEX IF NOT EXISTS tv_tracker_notifications_unread_idx
        ON tv_tracker_notifications (is_read, created_at DESC);

        CREATE INDEX IF NOT EXISTS tv_tracker_notification_events_observed_idx
        ON tv_tracker_notification_events (observed_at);

        INSERT INTO tv_tracker_notification_settings (singleton_id)
        VALUES (1)
        ON CONFLICT (singleton_id) DO NOTHING;
        """,
    ),
    SqlMigration(
        "0003_notification_timezone_mode",
        """
        ALTER TABLE tv_tracker_notification_settings
        ADD COLUMN IF NOT EXISTS timezone_mode TEXT NOT NULL DEFAULT 'automatic';
        """,
    ),
    SqlMigration(
        "0004_final_notification_schema",
        """
        ALTER TABLE tv_tracker_notifications
        ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'tv';

        CREATE TABLE IF NOT EXISTS tv_tracker_final_notification_settings (
            singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
            movie_released BOOLEAN NOT NULL DEFAULT TRUE,
            movie_release_updates BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        INSERT INTO tv_tracker_final_notification_settings (singleton_id)
        VALUES (1)
        ON CONFLICT (singleton_id) DO NOTHING;

        CREATE TABLE IF NOT EXISTS tv_tracker_movie_notification_baseline (
            movie_id TEXT PRIMARY KEY,
            region TEXT NOT NULL,
            snapshot JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """,
    ),
    SqlMigration(
        "0005_push_schema",
        """
        CREATE TABLE IF NOT EXISTS tv_tracker_push_subscriptions (
            subscription_id BIGSERIAL PRIMARY KEY,
            device_id TEXT NOT NULL,
            endpoint TEXT NOT NULL UNIQUE,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            user_agent TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_success_at TIMESTAMPTZ,
            failure_count INTEGER NOT NULL DEFAULT 0
        );

        ALTER TABLE tv_tracker_push_subscriptions
        ADD COLUMN IF NOT EXISTS session_version BIGINT NOT NULL DEFAULT 0;

        CREATE UNIQUE INDEX IF NOT EXISTS tv_tracker_push_subscriptions_device_idx
        ON tv_tracker_push_subscriptions (device_id);

        CREATE TABLE IF NOT EXISTS tv_tracker_push_presence (
            device_id TEXT NOT NULL,
            client_id TEXT NOT NULL,
            visible BOOLEAN NOT NULL DEFAULT FALSE,
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (device_id, client_id)
        );

        CREATE INDEX IF NOT EXISTS tv_tracker_push_presence_active_idx
        ON tv_tracker_push_presence (device_id, visible, last_seen_at);

        CREATE TABLE IF NOT EXISTS tv_tracker_push_deliveries (
            delivery_key TEXT PRIMARY KEY,
            subscription_id BIGINT NOT NULL REFERENCES tv_tracker_push_subscriptions(subscription_id) ON DELETE CASCADE,
            notification_id BIGINT,
            payload JSONB NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_error TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS tv_tracker_push_deliveries_pending_idx
        ON tv_tracker_push_deliveries (status, next_attempt_at);

        CREATE INDEX IF NOT EXISTS tv_tracker_push_deliveries_notification_idx
        ON tv_tracker_push_deliveries (notification_id);

        INSERT INTO tv_tracker_schema_meta
        (singleton_id, schema_version, updated_at)
        VALUES (1, 5, NOW())
        ON CONFLICT (singleton_id) DO UPDATE
        SET schema_version = EXCLUDED.schema_version,
            updated_at = NOW()
        WHERE tv_tracker_schema_meta.schema_version < EXCLUDED.schema_version;
        """,
        schema_contract=SchemaContract(
            schema_version=DATABASE_SCHEMA_VERSION,
            managed_relations=_MANAGED_RELATIONS,
            validation_sql=_CURRENT_SCHEMA_VALIDATION_SQL,
            legacy_schema_versions=_LEGACY_SCHEMA_VERSIONS,
            adoption_seed_sql=_CURRENT_SCHEMA_ADOPTION_SEED_SQL,
        ),
    ),
)

_LATEST_SCHEMA_CONTRACT = MIGRATIONS[-1].schema_contract
if (
    int(MIGRATIONS[-1].migration_id.split("_", 1)[0]) != DATABASE_SCHEMA_VERSION
    or _LATEST_SCHEMA_CONTRACT is None
    or _LATEST_SCHEMA_CONTRACT.schema_version != DATABASE_SCHEMA_VERSION
):
    raise RuntimeError("Database schema version must match the latest migration ID")
