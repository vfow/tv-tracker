# Collections index native ownership

`CollectionsIndex.vue` receives a typed `CollectionsIndexViewModel` through the
existing Discover bridge and frontend entry. Vue now composes search, menus,
chips, poster stacks, results, View More, and loading/error/empty states. The old
index composer, HTML menu/card/stack/skeleton helpers, and per-render event binder
have been removed. Collection poster normalization and stack ordering remain
shared data helpers used by the native Discover hub and index.

The existing collection services still own cached/provider data, live search and
request cancellation, relevance, sorting, filters, pagination, canonical routes,
and return-position storage. The existing router still owns anchor navigation.
The existing capture listener saves collection return positions; the bridge calls
the same restore service after native renders.

Search draft/debounce belongs to the component, with the same 360ms delay and
immediate Enter submission. Reactive updates retain the input and focus while
background data changes. Unmount clears the timer; action guards also prevent a
departed index's pending search from changing navigation. CLEAR ALL continues to
reset genre/decade/sort without clearing the search query.

Tests exercise the real app filtering and paging services, 64-item initial pages,
View More, search draft/commit, query serialization, poster placeholders, unchanged
tracker data, and inactive-page guards. The Chrome fixture loads the committed
bundle and checks controls, search focus during a model refresh, debounce, Enter,
canonical links, return-route restoration, and loading/error/empty states.

Remaining Sprint 3 composition: Browse, Genre/discovery listings, and Person,
then the repository-wide ownership/dead-code audit. Whole-system, torture,
responsive, authenticated production, documentation, and observability gates
remain outstanding.
