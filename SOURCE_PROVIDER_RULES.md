# TV Tracker Source Provider Rules

This file documents the source-provider contract for **TV Tracker v1.6.1 — TMDB Edition**.

## Active sources

```text
Metadata Source: TMDB
Artwork Source: TMDB
```

## Core rule

Do not mix TMDB and TVmaze for episode/date logic.

Episode/date authority controls:

```text
episodes
seasons
episode names
air dates
Upcoming
next episode
schedule logic
availability/date logic
```

Only the active metadata source may control those fields.

## Artwork rule

Artwork source controls:

```text
posters
backdrops
hero images
blurred background fills
```

Artwork may come from a different provider only when the edition explicitly says so.

## Old mixed metadata

Old mixed TMDB/TVmaze fields may remain in existing data and backups. Do not delete them during normal operation. Each edition must ignore fields that are not allowed by its active provider rules.

## Native backup restore rule

Native App Backup JSON import is an exact restore. It must not recalculate show statuses, episode availability, or schedule state during restore.

The top-level `import_info` object is app-owned restore metadata. It should be accepted, preserved, and ignored for provider-authority decisions.

## Compatible import rule

Compatible TV Time/Refrakt import is different from native backup restore. Compatible import may map statuses and migrate source data because it is importing from another app, not restoring a TV Tracker backup.
