# Person page native ownership

`PersonDetails.vue` now composes the filmography, media/role/eye controls,
biography, portrait fallback, and watched-progress panel from `PersonViewModel`.
The existing Discover bridge builds the model and forwards actions to canonical
person, credit, tracker, and navigation services in `app.js`. The frontend entry
owns mounting and reactive updates; expansion state resets for a different person
and survives filters for the same person.

Removed: `renderPersonDetailPage`, the profile/progress/card HTML composers, and
`attachPersonDetailPageEvents`. The shared portrait placeholder helper remains
used outside this page. Shared browse-menu dismissal and router ownership remain.

Preserved behavior includes deduplicated cast/crew credits, combined role labels,
popularity/date order, supported-role fallback on media changes, eye query flags,
movie opening, TV preview actions, and progress scoped to the selected filmography
before eye hiding. Tracker and History records are never rewritten by projection.

Two regressions found during verification are repaired:

- Each person load checks request identity, person, media, role, and active page
  before changing state or routing. Late successes and errors cannot replace
  newer navigation, including a different filter for the same person.
- Credit normalization had discarded TMDB's explicit adult classification. It
  now preserves booleans, shares explicit classification across duplicate
  cast/crew entries, and applies the existing adult policy to the resulting
  filmography. Unknown classification remains absent. A positive classification
  takes precedence if duplicate provider entries disagree. No classifier is
  inferred from ratings, genres, titles, or roles.

Tests use actual app services for credit merging, media/role changes, progress,
eye flags, routes, adult policy, missing classification, tracker immutability,
and stale requests. The Chrome fixture executes the committed bundle's controls,
biography expansion, portrait fallback, escaped text, progress, movie/TV actions,
and loading/error/empty states. Full CI and deployment remain release gates.
