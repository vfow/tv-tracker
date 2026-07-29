# TV Tracker v1.6.1 — Exact Backup Restore Fix (TMDB Edition)

This patch is applied over **TV Tracker v1.6.0 — TMDB Edition**.

## Included corrections

**Native App Backup import**

- Native App Backup JSON import is now treated as an exact restore.
- The import flow no longer runs `autoUpdateStatuses` after loading the backup.
- Imported show statuses are preserved from the backup instead of being recalculated during restore.
- The server now accepts the app-owned top-level `import_info` state object that older/current backups can contain.
- `import_info` is preserved in data and future backups instead of causing `Unsupported state key` errors.
- The restore remains transactional: if validation fails, the current tracker data is not replaced.

**Source-provider rules remain unchanged**

```text
Metadata Source: TMDB
Artwork Source: TMDB
```

This patch does not change the TMDB/TVmaze source split.

## Files changed

```text
VERSION_NOTES.md
SOURCE_PROVIDER_RULES.md
templates/index.html
static/js/source-provider.js
static/js/app.js
app.py
```

## Install

1. Export a fresh App Backup JSON before replacing files.
2. Apply this patch only over **v1.6.0 — TMDB Edition**.
3. Do not apply it over the other v1.6.0 editions.
4. Extract the patch ZIP over the project root.
5. Commit with:

```text
Repair TV Tracker v1.6.1 TMDB backup restore import
```

6. Deploy normally:

```bash
cd ~/www/tv-tracker
git pull --ff-only origin main
```

7. Restart the website.
8. Hard-refresh desktop and phone.

## Verify before tagging

Confirm that:

- Settings still shows `Metadata Source: TMDB`.
- Settings still shows `Artwork Source: TMDB`.
- Native App Backup JSON import no longer fails with `Unsupported state key: import_info`.
- A native backup restore does not change show statuses during import.
- Existing watched history remains intact.
- App Backup JSON export still works after importing.
- Compatible TV Time/Refrakt import still works as a migration flow.

## Notes

This is a data-safety patch. It fixes restore/import behavior and does not modify provider selection, episode source rules, or database schema version.
