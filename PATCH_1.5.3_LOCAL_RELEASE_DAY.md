# TV Tracker v1.5.3 — Local Release Day Fix

## Problem

Versions 1.5.1 and 1.5.2 still treated the stored TMDB `air_date` as the only calendar day. That fails for international use: an episode airing Thursday night in the origin country can be Friday in the user's current timezone. In Malaysia, many U.S. evening releases should appear on the next local day.

## Fix

- Keep TMDB `air_date` as the stored source date.
- When a verified TVmaze `airtime` plus offset-bearing `airstamp` exists for the exact episode, use the airstamp as the real release instant.
- Display, group, sort, countdown, and batch Upcoming items by the browser/device local date derived from that instant.
- Date-only episodes without a trustworthy timestamp still use the stored TMDB date.
- No hardcoded country or timezone was added.
- No 9 AM rule was added.
- TVmaze was not removed.

## Installation

Apply this over v1.5.2, restart Flask, then hard-refresh the browser.
