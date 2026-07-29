# TV Tracker v1.6.0 — TVmaze Edition with TMDB Artwork

## Included corrections

**Source split foundation**

- Built directly from the official TV Tracker v1.5 main ZIP.
- Does not carry forward v1.5.1, v1.5.2, or v1.5.3.
- Adds a fixed source-provider mode for this edition.
- Settings displays only:

```text
Metadata Source: TVmaze
Artwork Source: TMDB
```

**Edition behavior**

- TVmaze controls show search, show metadata, episodes, seasons, episode names, air dates, Upcoming, and next episode logic. TMDB is used only for posters, backdrops, and hero images.
- Old mixed TMDB/TVmaze metadata is preserved in data and backups.
- Disallowed provider fields are ignored by the running edition.
- There is no Settings switch for changing source providers inside the live UI.
- Cache-busting is set to `1.6.0-tvmaze-artwork-tmdb`.

## Install

1. Export a fresh App Backup JSON from v1.5.
2. Start from a clean v1.5 project copy or branch.
3. Extract this patch ZIP over the v1.5 project root.
4. Do not stack this patch with either of the other v1.6.0 edition patches.
5. Commit with:

```text
Create TV Tracker v1.6.0 source split tvmaze-tmdb edition
```

6. Deploy normally, restart the website, and hard-refresh desktop and phone.

## Verify before tagging

- Settings shows exactly the correct Metadata Source and Artwork Source for this edition.
- Upcoming reads dates from the edition's metadata source only.
- The failed v1.5.1/v1.5.2/v1.5.3 date-hotfix behavior is not present.
- App Backup JSON still exports successfully.
- Existing shows remain in the library after applying the patch.
- Compatible import still preserves watched progress and history.

## Safe testing order

Recommended order:

1. TVmaze Edition with TMDB Artwork.
2. TMDB Edition.
3. Strict TVmaze Edition.

Test each edition on a separate branch or separate project copy.
