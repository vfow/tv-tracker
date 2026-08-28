# Recovery and Restore Drills

TV Tracker uses two recovery layers with different purposes. Neither layer is a substitute for the other.

- The application-native backup format protects TV Tracker user state and is validated by the application before replacement.
- PostgreSQL/provider backups protect the database as a whole, including migration metadata and operational tables.

Never commit backup contents, database dumps, credentials, provider tokens, or restored user data to this repository.

## Automated PostgreSQL restore drill

`tools/postgres_restore_drill.py` is a **loopback-only** destructive test helper for an isolated PostgreSQL instance. It proves that the installed PostgreSQL client can create a custom-format dump, restore it into a fresh database, validate the migration ledger/checksums/schema contract, and reproduce exact row counts for every `tv_tracker_%` table.

The tool deliberately refuses a non-loopback database host. **Never run the automated restore drill against production.**

Run it only against a disposable local or CI database:

```text
TEST_DATABASE_URL=postgresql://...@127.0.0.1:5432/tvtracker_test \
python tools/postgres_restore_drill.py
```

The command:

1. verifies the source database is on the current migration contract;
2. records exact row counts without reading or printing row contents;
3. writes a mode-`0600` temporary custom-format dump;
4. creates a randomly named disposable database on the same local server;
5. restores the dump with ownership/privilege replay disabled;
6. verifies the restored migration ledger, checksums, schema contract, and row counts;
7. force-drops the disposable database and deletes the temporary dump even when the drill fails.

The command prints only aggregate verification results. It does not print the database URL, password, dump path, table contents, or subprocess stderr.

CI executes the real dump/restore path against PostgreSQL 16 as part of the regression suite. That proves repository restore tooling remains executable, but it does **not** prove that the hosting provider's latest production backup is usable.

## Provider backup restore drill

A real provider backup must be tested outside production. Use an isolated database/account or another environment that cannot receive production traffic.

1. Select a specific provider backup/snapshot and record its timestamp privately.
2. Restore it into the isolated PostgreSQL target using the provider-supported procedure.
3. Point a temporary shell environment at the restored database. Do not change the production WSGI site or production scheduler.
4. From the matching application release, run:

```text
python -m tvtracker.maintenance operational-check
```

5. Require the migration ledger/checksums and canonical schema contract to pass.
6. Review the aggregate database-size, connection-capacity, and table-statistics output for obvious anomalies.
7. Perform a private application-level spot check of representative tracker data. Do not paste user data into tickets, CI logs, or repository files.
8. Destroy the isolated restore after recording only non-sensitive drill results.

Measure the observed restore duration and the age of the backup used. Those measurements establish actual recovery-time and recovery-point evidence; do not claim an RTO or RPO that has not been measured and accepted.

Run a provider-level restore drill at least quarterly, after a material database migration, and after any change to the provider backup configuration.

## Application-native backup recovery

The native import path validates and normalizes the payload before replacing tracker state transactionally. Use it when the database is healthy and the recovery goal is specifically tracker/user state.

Before importing:

- preserve the current database/provider backup;
- verify the candidate native backup parses and passes the current backup validator;
- confirm the intended backup version is supported;
- ensure the operator understands that native import replaces tracker state.

After importing, verify the application, revision/sync behavior, and a representative sample of tracker data.

Do not use native import to repair a broken PostgreSQL schema or migration ledger.

## Operational baseline

Run the read-only baseline command after deployments, during incidents, and when reviewing database capacity:

```text
python -m tvtracker.maintenance operational-check
```

The command fails closed if migration initialization, checksums, schema version, or the canonical schema contract are wrong. On success it returns only aggregate operational data:

- expected schema version and migration count;
- schema verification and database ping duration;
- database size;
- current connection count and configured maximum;
- per-`tv_tracker_%` estimated live/dead tuple counts and dead-row percentage.

It does not emit hostnames, database names, usernames, passwords, row contents, media identifiers, or tracker records. The metrics are a baseline for trend comparison, not automatic capacity thresholds.

## Dependency maintenance

Dependabot checks Python, npm, and GitHub Actions every Monday morning in the repository's operating timezone. Minor and patch version updates are grouped per ecosystem to reduce review noise; major version updates remain separate so compatibility changes receive focused review. Security updates remain independent of these version-update groups.

Do not auto-merge dependency updates merely because they are minor or patch releases. The full CI/security gates remain authoritative.

## Recovery decision guide

Use source rollback when a newly deployed application SHA is demonstrably bad and the database remains compatible. The deployment workflow already preserves the previous source SHA and does not automatically reverse additive migrations.

Use a provider PostgreSQL restore only for demonstrated database loss/corruption where forward repair is less safe than restoration. Before restoring, preserve current evidence and determine what writes would be lost relative to the selected backup.

Use native backup import when PostgreSQL itself is healthy but tracker state needs to be replaced from a known-good native export.

Do not perform multiple recovery methods at once. Make one controlled change, verify it, and preserve evidence before the next action.

## Post-recovery acceptance

After any recovery:

1. confirm the intended full Git SHA is running;
2. run `/healthz`/Production Smoke and require the exact release SHA;
3. run `python -m tvtracker.maintenance operational-check`;
4. confirm the notification worker resumes its expected cadence without sustained overlap/failure events;
5. verify representative tracker behavior privately;
6. record the incident cause, recovery method, backup timestamp if relevant, measured recovery duration, and follow-up action without recording secrets or user data.

A successful recovery is not complete until both application availability and database integrity are independently verified.
