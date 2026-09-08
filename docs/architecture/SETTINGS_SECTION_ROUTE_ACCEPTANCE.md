# Settings section route correction

Authenticated production acceptance after PR #147 found that switching to
Streaming displayed the correct Vue section but left the URL at `/app/settings`.
Refreshing returned to Profile. No profile or region save was performed.

The existing `showPage()` queues `updateRouteFromState()`. The router's Settings
branch reconstructed only the generic path and overwrote the specific route
already set by `TVTrackerSettings.open()`. It now reads the current section from
that existing Settings owner and uses its canonical route builder. The router
remains the sole History API writer.

The regression exercises all six section routes through the real Settings state
owner and router. The browser test adds the actual shell's delayed update,
reloads the selected section, then checks Back and Forward with visible state.
No account, persistence or Settings component behavior changes.
