# TV Tracker v1.6.1 — Source Split Foundation (Strict TVmaze Edition)

This is a **consolidated changed-files-only patch** applied directly over clean **TV Tracker v1.5**.

It includes both:

```text
v1.6.0 — Source Split Foundation
v1.6.1 — Exact Backup Restore Fix
```

Do not install the old v1.6.0 patch first. Do not install the separate v1.6.1 restore-fix patch after this.

## Active source rules

```text
Metadata Source: TVmaze
Artwork Source: TVmaze
```

TVmaze controls show search, show metadata, episodes, seasons, episode names, air dates, Upcoming, next episode logic, and artwork. TMDB is ignored completely.

## Included corrections

**Source split**

- Adds fixed provider mode for this edition.
- Adds `static/js/source-provider.js`.
- Adds `SOURCE_PROVIDER_RULES.md`.
- Adds edition-specific cache-busting labels.
- Settings displays the active metadata source and artwork source.
- No source switch button is added.
- The app no longer mixes TMDB and TVmaze for episode/date authority.
- Old mixed metadata is preserved in data/backups but ignored when it is not allowed by this edition.

**Exact native backup restore**

- Native App Backup JSON import is treated as an exact restore.
- Import no longer runs `autoUpdateStatuses` after loading a native backup.
- Imported show statuses are preserved from the backup.
- The server accepts and preserves the app-owned top-level `import_info` state object.
- Fixes `Unsupported state key: import_info`.
- If validation fails, current tracker data is not replaced.

**What is not included**

- No 9 AM release-time rule.
- No release-time setting.
- No database schema change.
- No deletion of watched history.
- No deletion of old TMDB/TVmaze metadata from backups.
- No carry-forward of failed v1.5.1, v1.5.2, or v1.5.3 date hotfix attempts.

## Files changed

```text
VERSION_NOTES.md
SOURCE_PROVIDER_RULES.md
templates/index.html
static/js/source-provider.js
static/js/app.js
static/js/ui.js
app.py
```

## Install

1. Export a fresh App Backup JSON first.
2. Start from a clean **TV Tracker v1.5** project copy or branch.
3. Extract this patch ZIP over the v1.5 project root.
4. Do not stack this patch with the other v1.6.1 consolidated editions.
5. Commit with:

```text
Create TV Tracker v1.6.1 Strict TVmaze Edition
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

- Settings shows `Metadata Source: TVmaze`.
- Settings shows `Artwork Source: TVmaze`.
- Native App Backup JSON import does not fail with `Unsupported state key: import_info`.
- Native backup restore does not change show statuses during import.
- Existing watched history remains intact.
- App Backup JSON export still works after importing.
- Upcoming uses only the edition's metadata source for episode/date logic.
- Compatible TV Time/Refrakt import still works as a migration flow.

## Safe testing rule

Each consolidated patch is an alternative over clean v1.5:

```text
v1.5 → v1.6.1 TMDB Edition
v1.5 → v1.6.1 TVmaze Edition with TMDB Artwork
v1.5 → v1.6.1 Strict TVmaze Edition
```

Do not stack them:

```text
v1.5 → TMDB patch → TVmaze patch → Strict TVmaze patch
```
