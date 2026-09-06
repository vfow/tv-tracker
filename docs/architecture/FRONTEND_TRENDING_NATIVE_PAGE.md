# Full-page Trending native composition

Baseline: `b769c7afb345681efa92a8cb8850ddf100d97c22`.

The Discover hub is already Vue-owned. This slice replaces only the separate
full-page Trending HTML renderer and its card/back event binders.

`TrendingPage.vue` owns the page header, ranked grid, artwork fallback, ratings,
adult badges, loading, error/empty states, and card/back interactions. The existing
Discover bridge supplies a frozen typed model through the shared Vue loader.
Late asset/model callbacks are guarded against both route and Trending-key changes.
The loader uses the existing shared runtime failure surface.

`trending.js` retains its four feed definitions, exact TMDB ranking, normalization,
cache TTLs, provider requests, hub-row merging, current-page request guards, shell
activation, and canonical router extension. Its former HTML composition and event
binders are removed. Shared genre card helpers remain because Browse, Genre,
Collections, and Person still actively use legacy composition.

The new asset entry tolerates the preceding bridge version in tabs opened before
deployment. The existing Vite infrastructure and Search/Discover hub components
remain the established owners; no additional script-loader architecture is added.

Verification includes model/action/ranking/artwork/state/route-race tests, the
existing complete JavaScript suite, typechecking, Vue/Tailwind builds, and a real
Chrome fixture that loads the production bundle and verifies native card/back
actions and escaped provider text. Chrome is supplied by CI; unavailable local
backend dependencies also leave the full PostgreSQL suite to exact-head CI.

Sprint 3 remains open for Browse, Genre, Collections, Person, and final proven-dead
frontend cleanup. Full product torture, responsive, authenticated acceptance, and
observability gates remain outstanding.
