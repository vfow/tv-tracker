# TV Tracker Source Provider Rules

TV Tracker v1.6.0 introduces a source split so that episode/date logic never mixes TMDB and TVmaze in the same edition.

## Current edition

```text
TV Tracker v1.6.0 — TVmaze Edition with TMDB Artwork
Metadata Source: TVmaze
Artwork Source: TMDB
```

## Non-negotiable rule

One edition must have one authority for episode/date logic. Do not combine TMDB and TVmaze to decide episode names, season lists, air dates, Upcoming groups, next episode, or availability status.

## Metadata source controls

The metadata source controls:

- show search
- show metadata
- seasons
- episode lists
- episode names
- air dates
- Upcoming
- next episode logic
- availability/date logic

## Artwork source controls

The artwork source controls only:

- posters
- backdrops
- hero images
- decorative image URLs

Artwork must not change episode dates, Upcoming grouping, watched/unwatched availability, or season structure.

## Old metadata

Old mixed TMDB/TVmaze fields may remain in the database and backups for rollback safety. The running edition must ignore fields that do not belong to its configured source.

## Patches are alternatives

The three v1.6.0 patches are separate alternatives. Apply each patch directly over clean v1.5. Do not apply them cumulatively.
