# Native Watchlist controls

The Watchlist cards were already native. This slice closes the remaining search
and advanced-filter composition boundary; it does not redesign tracker state.

`TrackerListsSurface.vue` now includes `TrackerListControls.vue`. The existing
read-only tracker state bridge projects query, selections and option counts.
Control actions update the same runtime filter fields and invoke the established
filter/sort helpers, reset service and router synchronization. Status navigation
remains the static shell links handled by the existing router. No additional
History API writer, network API or persistence path is introduced.

The two control slots in the Flask shell are Vue Teleport targets. Their markup,
values, menu state and document listeners belong exclusively to the component.
The Watchlist owner updates its model without remounting, preserving search focus
and open menu state. Unmount removes the teleported controls and listeners.

Removed from `ui.js`: `renderLibrarySearchControl`, `createLibraryFilterMenu`,
`createLibrarySearchBox`, `removeLibrarySearchControl`,
`closeLibraryFilterDropdown`, and `setSelectOptions`, plus their callers.
The option-count, search, sort, reset and route services remain active.

The committed-bundle browser acceptance uses the real app/filter/state services
and verifies intersections, sorting, search focus, zero-count selections, reset,
route debouncing, keyboard close/focus and non-mutation of tracker/History truth.
Iframe viewports exercise actual CSS media queries at 320, 375 and 1280 pixels,
including menu bounds and page overflow. Existing tracker-action and routing
regressions remain required. Run full exact-head CI, then verify the combined
main deployment and authenticated production controls before accepting this slice.

The broader function classification, active Profile/Episode ownership and later
whole-system, torture, responsive and production release gates remain open.
