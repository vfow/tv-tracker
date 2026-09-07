# Native Browse, Genre and discovery listings

`BrowseListing.vue` and `BrowseControls.vue` consume typed `BrowseListingModel`
values from the existing Discover Vue bridge. `BrowsePicker.vue` owns remote
search drafts, debounce, request generations and unmount cancellation. The shared
`genre-detail-content` root unmounts its prior Vue owner before changing surfaces.

The retained services in `app.js` and `discover-browse.js` own canonical filter
normalization, reference/catalog caches, provider requests, adult and eye policy,
result merging/sorting, pagination, labels, detail navigation and canonical routes.
Genre base filters and provider/company/network/discovery-category semantics
remain unchanged. TV certification and category-specific control restrictions
remain. Browse opens full details with its back route; Genre/discovery TV results
retain the existing preview action. Tracker and History records are untouched.

Vue owns year/decade navigation; genre, country, language, service, runtime, sort,
status and certification controls; theme/company/network pickers; active chips;
media switching; eye filters; result cards and loading/error/empty states. Country
search retains UK aliases. Duplicate picker names retain country disambiguation.
Media mapping and picker responses cannot navigate or replace newer routes.

Removed: the three listing page composers and dedicated binders, Browse menu/card
composers, picker HTML and DOM mutation helpers, obsolete year strip mutation,
legacy picker timers and the replaced global Browse event branches. Shared menu
dismissal and Search eye compatibility remain for their current consumers; the
repository-wide audit will classify those boundaries along with other globals.

Validation: native service-level regression covers filters, routes, scoped base
filters, cards, paging, unknown metadata, canonical actions, late picker replies
and tracker immutability. Chrome acceptance loads the committed CSS and Vue bundle
with real app filter/request services, checking menus, country search, year strip,
sort, service and company filters, eye visibility, paging, shared root transitions
and loading/error/empty states. Existing project regression, typecheck and build
gates remain required. Full Sprint 3 ownership audit and Sprints 4–6 are pending.
