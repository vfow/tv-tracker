# Phase 3 — Data Integrity Audit

Status: implementation complete pending/subject to the normal CI gate on this branch.

This document records the data-integrity contract for the architecture stabilization batch. It deliberately does **not** contain the owner's raw backup, watch history, titles, timestamps, or other private production data. A fresh production-shaped native backup and HTML report were used privately to characterize real failure modes.

## Priority

The governing order is:

1. user data safety;
2. data integrity;
3. security;
4. compatibility;
5. reliability;
6. UX;
7. architecture cleanliness.

No cleanup is allowed to rewrite uncertain historical truth merely to make current metadata look tidy.

## Core invariants

| Invariant | Canonical owner | Failure if broken | Required behavior |
|---|---|---|---|
| Watched history never silently disappears | PostgreSQL tracker history + synchronized browser state | irreversible loss of user history | preserve unless the user explicitly performs a destructive action |
| TMDB ID is canonical only after a deterministic match | tracker show record | history/progress attached to the wrong show | external-ID match first; ambiguous title fallback stays local-only |
| Imported source IDs are evidence, not canonical tracker identity | compatible-import metadata | source numbering overwrites canonical identity | retain source metadata; promote to TMDB only after deterministic resolution |
| Specials and regular episodes are different identities | history/progress model | a special can mark/delete a normal episode sharing coordinates | special-aware history identity; special progress never enters regular `episodes_watched` |
| Movies are not TV episodes | history model | movie watches inflate regular episode totals | separate movie history summary/counting |
| Show-ID migration is referential | remap boundary | history/favorites become orphaned after local → TMDB promotion | migrate dependent history/favorite/sync references with the show key |
| Native backup compatibility is versioned consistently | backend schema + browser backup contract | a backup exported by one path is rejected by another | browser and backend use the same current schema version; v1/v2 backups remain accepted when supported |
| Sync conflict does not silently overwrite newer state | sync protocol | stale client destroys newer changes | conflict/reset response and replay/rebase behavior remain covered |
| Duplicate cleanup is conservative | episode/history integrity layer | cleanup chooses metadata/progress incorrectly | union progress after choosing the preferred original record; dedupe only true same-identity history |
| Provider data is optional | provider/release caches | provider failure mutates tracker truth | provider data may be discarded/rebuilt without changing watched/history state |

## Confirmed failure classes

### 1. Ambiguous title fallback could attach an import to the wrong TMDB show

Compatible imports are initially preserved as local records and later enriched. The legacy title fallback removed a trailing year and, if no exact title match was found, could take the first TMDB search result. Same-title shows therefore had a path to incorrect canonical identity.

Phase 3 changes the rule:

- TVDB external ID remains the first choice;
- IMDb external ID remains the second choice;
- title fallback requires an exact normalized title;
- a year suffix, when present, must match `first_air_date` year;
- more than one exact candidate is ambiguous and returns no match;
- no first-result/fuzzy fallback is permitted;
- an unresolved item stays local-only instead of guessing.

This is intentionally conservative. Missing metadata is recoverable; attaching user history to the wrong canonical show is not.

### 2. Local → TMDB promotion did not migrate all dependent user references

The legacy `moveShowStorageKey` moved the show record and some queue/favorite state but did not migrate history references. That could leave watched history pointing at the old local ID after the show became canonical.

The Phase 3 boundary now migrates:

- history `tmdb_id` / legacy `show_id` references;
- favorite show references;
- metadata-sync pending/failed references;
- network-sync pending/failed references.

History entry IDs remain stable. A remap changes the referenced show identity, not the historical event's primary key.

### 3. Imported specials could contaminate regular episode progress

Compatible source data can label an episode as a special even when its source season/episode coordinates look like normal TV coordinates. The legacy importer put every watched source episode into `episodes_watched`, and later metadata hydration reapplied all imported watched coordinates. A special could therefore make a normal episode appear watched.

Phase 3 separates the models:

- regular watched source episodes populate `_imported_progress.watched` and `episodes_watched`;
- specials populate `_imported_progress.specials` only;
- a special-only coordinate is removed from regular progress during import;
- if the source contains both a genuine regular watched episode and a special at the same coordinate, regular progress is preserved;
- metadata hydration skips imported entries marked special;
- existing uncertain user history is **not** automatically deleted or rewritten.

### 4. History dedupe previously treated special and regular coordinates as identical

The old history key was `show + season + episode`. That is insufficient when an imported special shares coordinates with a regular episode.

Phase 3 identity is now:

- regular: `show + regular + season + episode`;
- imported special with source episode ID: `show + special + source episode ID`;
- special without source ID: `show + special + source coordinates + title`;
- movie history stays outside TV episode dedupe.

This also makes single-episode unwatch operations preserve a colliding special.

### 5. Whole-season unwatch could delete imported specials

The legacy whole-season action filtered all history rows with the selected show/season, regardless of `special`.

The Phase 3 boundary now removes only regular TV episode history for that season. Imported specials and movie history are preserved.

### 6. Browser and backend native backup schema versions drifted

The backend current schema is 5 while the browser exporter/transactional fallback was hardcoded to 4 and the browser validator rejected schema 5.

Phase 3 makes the browser current schema 5, verifies it against the backend constant in regression tests, accepts current schema-5 native backups, and retains the existing supported older-backup path.

The production WSGI backup response also receives an explicit data-integrity hardener while the large legacy `app.py` route remains in transition. When backend extraction reaches the backup domain, this logic must move into the canonical backup service and the WSGI response shim must be removed.

### 7. Backup summary mixed movie history into regular TV history

`regularHistoryEntries = total - specials` becomes incorrect once movie history exists.

Phase 3 now classifies history as:

- `regularHistoryEntries` — regular TV episode history only;
- `specialHistoryEntries` — TV specials;
- `movieHistoryEntries` — movie watches;
- `otherHistoryEntries` — structurally unclassified legacy records;
- `historyEntries` — unchanged total.

The total remains lossless; the categories explain it instead of changing it.

## Production-shaped characterization finding

The private reference backup and HTML report exposed a discrepancy between raw non-special history and current regular progress. The audit traced it to a small set of history-only and progress-only episode coordinates, including incorrect same-title import attachment and special/regular coordinate collisions.

Important conclusion: **this is not evidence that the entire tracker database is corrupt.** The inspected backup retained unique history IDs and structurally coherent bulk data. The failures are localized to import identity/classification boundaries.

The reference also demonstrated why automatic historical repair is unsafe: source files can themselves contain watched flags that the owner disputes. Therefore Phase 3 does not infer personal watch truth from an imported source flag merely because that flag exists.

## Non-destructive anomaly policy

`TVTrackerDataIntegrity.suspiciousHistoryReferences(data)` is diagnostic only. It can flag examples such as:

- history pointing to a missing show;
- a regular history season beyond the currently known season count;
- a regular history episode beyond a currently known season episode count.

It does not mutate data.

A metadata provider can renumber, remove, merge, or later restore episodes. Consequently an out-of-range historical record is **evidence to review**, not permission to delete it.

Any future repair tool must:

1. produce a preview;
2. identify the exact records and proposed destination/change;
3. preserve an export/rollback path;
4. require explicit user confirmation for uncertain historical changes;
5. never use title similarity alone to rewrite canonical history.

## Current → transition → target data architecture

### Current

- PostgreSQL stores shows, history, state, revision/change log, admin state, notifications, provider state and related runtime tables.
- `static/js/db.js` owns synchronized browser/server mutations plus the durable pending-save queue.
- `static/js/app.js` still owns a large amount of tracker normalization/import/export behavior.
- historical integrity scripts remain in the classic-script composition root.

### Transition after Phase 3

- `static/js/data-integrity.js` is the explicit browser integrity boundary loaded after legacy `app.js` but before startup data is released by the second duplicate-integrity hook.
- `tvtracker/data_integrity.py` owns backend history classification used at the production WSGI backup boundary.
- no CI source transformation is used; CI tests the checked-in tree.
- compatibility globals remain only because the frontend has not yet completed domain extraction.

### Target

- Flask + PostgreSQL remain the platform for this stabilization batch.
- canonical backup/import/sync services own versioning and validation server-side.
- browser modules call explicit APIs rather than replacing legacy globals.
- provider caches are separate from user-owned tracker state.
- all user-owned data becomes user-scoped when public multi-user registration is introduced.
- WSGI response shims and historical patch files are removed only after canonical callers and tests have migrated.

A Vue/Vite/TypeScript rewrite is not required by this data architecture. It remains a future option, not an assumption.

## Mutation-path risk register

| Path | Risk | Severity | Phase 3 disposition |
|---|---|---:|---|
| episode/season watch/unwatch | wrong identity deletes unrelated special | Critical | special-aware identity + season-unwatch preservation |
| compatible JSON import | ambiguous show identity | Critical | strict match; unresolved stays local |
| compatible metadata sync | orphan history after ID promotion | Critical | dependent-reference remap |
| imported special hydration | false regular watched progress | Critical | special progress separated/skipped |
| native backup export/import | schema drift rejects valid backup | High | schema parity contract |
| backup summaries | movies misreported as TV episodes | Medium | typed history classification |
| duplicate show cleanup | preferred record can change after premature union | High | existing merge characterization retained |
| duplicate history cleanup | special collides with regular | Critical | typed episode identity |
| show removal | history/favorite orphaning | High | existing atomic removal contract retained |
| sync replay/conflict | stale overwrite | Critical | existing conflict/reset and pending-save contracts retained |
| Adult Filter | hidden title deletion | Critical | hide-only invariant remains; no destructive mutation |
| provider/release caches | provider state contaminates tracker truth | High | provider state remains optional/rebuildable |

## Migration and rollback rules

- Schema changes remain additive-first.
- Native backup versions 1 and 2 remain supported by the backend where already supported.
- A current browser backup must declare the same schema version as the backend.
- No Phase 3 startup migration rewrites suspicious history.
- The owner should retain a fresh native backup before any future reviewed historical repair.
- A rollback of Phase 3 code must not require a data rollback because the new integrity layer avoids destructive automatic migrations.

## Regression coverage added

Phase 3 contracts cover:

- browser/backend schema parity;
- special vs regular history identity;
- movies excluded from regular TV history counts;
- current-schema native backup export/validation/transaction fallback;
- same-title ambiguity and year-qualified strict matching;
- no first fuzzy result fallback;
- local → TMDB dependent-reference migration;
- special-only imported progress removal;
- metadata hydration refusing to reapply specials as regular progress;
- diagnostic anomaly detection remaining non-mutating;
- production WSGI backup-summary classification;
- script load order before startup data release.

Existing regression coverage continues to protect duplicate-show progress union, show-removal atomicity, sync conflict behavior, backup validation, and the broader suite.

## Exit criteria

Phase 3 is complete only when all of the following are true:

- the code above is checked into the architecture branch;
- the new Phase 3 regression tests pass;
- the full existing regression suite passes;
- production dependency audit passes;
- `git diff --check` passes;
- PR #29 remains open/draft/unmerged;
- no raw private backup/report has been committed.
