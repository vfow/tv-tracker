# Search provider failure ownership

The final ownership audit found one live Search exception path in `app.js` that
still overwrote `#search-results` with HTML after the native owner had mounted.
The ordinary results, empty and loading paths already used Vue.

Provider failure now sets an explicit boolean in the existing Search state and
renders through `search-state-bridge.js` and `SearchResults.vue`. The message is
generic. A native retry action delegates to the same canonical search service,
keeping query, media, tracked filters, cancellation and route behavior. A new
request or cleared query clears the error. Error state hides stale pagination.
Late renders and late bundle attachment cannot paint after leaving Search or
Discover. The old `renderSearchError` HTML writer is removed.

The new browser regression uses the actual application Search service and built
Vue bundle with a synthetic provider boundary. At 320, 375 and 1280 pixels it
exercises loading, rejected request, native error, retry, escaped successful
results, preserved filters, route departure, empty-query reset and unchanged
tracker/History data. Existing projection tests also cover the new state and
retry action. Bootstrap asset-loading/failure compatibility remains separate
from the provider failure state and is not claimed removed by this slice.

Preceding slice: PR #150 passed CI on
`0e8e3a32d08de0de5a99b3ffc95e039e6c26071f` (run 34250610851), merged as
`96022b2f4303ed4b5cddfd6bc131c0368d3d6eb9`, and deployed successfully in run
34251719643. That slice ran 476 Python/browser tests and 85 JavaScript tests.
