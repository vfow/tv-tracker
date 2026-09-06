# Collection Details native ownership

Collection Details is composed by `CollectionDetails.vue` from the typed
`CollectionViewModel`. The existing Discover bridge supplies data and actions;
the existing frontend entry owns mounting. Updates to one collection use reactive
props so open tracked-filter menus and focus survive filtering. A different
collection remounts the component. Trending and Collection Details unmount each
other before taking the shared detail root.

The data path is:

`CollectionDetails.vue` → Discover bridge → collection services in `app.js` →
authenticated `/api/tmdb/collections/<id>` → canonical TMDB transport.

The collection services continue to own normalization, caches, collection order,
sort/filter rules, eye state, tracker lookups, canonical query parameters, and
movie/back navigation. Vue owns header, controls, active chips, cards, skeletons,
empty/error states, and their local events. Shared browse-menu dismissal remains
the existing interaction service; no collection-specific legacy binder remains.

Removed: the Collection Details HTML composer and its control/menu/chip
composers, plus `attachCollectionDetailPageEvents`. The index renderer and shared
poster renderer are still needed by other pending Discover surfaces.

Collection request identity is checked after each awaited stage and before error
handling. An old response, including an old request for the same ID with different
filters, cannot replace newer navigation or route it to a stale error page.

Verification includes actual app-service filtering, ordering, query parameters,
eye flags, unchanged tracker data, loading/error/empty states, stale responses,
and a real Chrome fixture that loads the production bundle and executes its
controls and movie/back actions. The fixture also checks Vue text escaping,
modified clicks, and tracked-menu continuity. Full CI, deployment health, and
live navigation are release gates; this does not complete the mobile matrix.
