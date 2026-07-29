# TV Tracker v1.5.2 — Persistent No-Early-Day Repair

Base version: **v1.5.1**
Patch version: **v1.5.2**

## Problem

v1.5.1 corrected the timestamp helper, but it did not fully repair already-saved cached schedule rows. If an existing `_episode_list` row already had the wrong previous-day `air_date`, Upcoming could still show that cached row before the fresher TMDB `next_episode_to_air` value was used.

## Fix

- Prefer TMDB `next_episode_to_air` before cached season rows when building future schedule entries.
- Force a one-time TMDB schedule refresh for existing shows by clearing `last_tmdb_refresh` once.
- Keep TVmaze in the system.
- Do not add a 9 AM availability rule.
- Do not change the database schema or backup format.

## Install

Overlay the patch ZIP onto a clean **v1.5.1** project root, restart the Flask app, and hard-refresh the browser. Then open Upcoming once so the background schedule refresh can rewrite stale cached episode rows from TMDB.
