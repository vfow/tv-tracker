# Frontend Modernization Phase 5 — Shared UI / Feedback

Status: implementation slice in progress

Production baseline: `553769d308b11ece0c74ae0121581b6b187a9b3f`

## Goal

Establish a typed Vue-era feedback boundary before migrating larger product surfaces. This slice does not replace the proven visible feedback renderer. It gives Vue callers one typed module that delegates to the existing authoritative feedback and error-classification services.

## Ownership

Visible feedback remains owned by `static/js/feedback.js`.

That owner continues to provide:

- one `#tv-feedback-root` surface;
- severity-specific cards;
- queueing and a three-card visible cap;
- deduplication;
- persistent warning/error feedback;
- retry actions;
- technical-message sanitization;
- bounded developer diagnostics;
- the persistent offline banner;
- the `showToast` compatibility bridge for remaining legacy callers.

`frontend/src/ui/feedback.ts` is an adapter, not a renderer. It must not create DOM, create another toast root, or duplicate sanitization UI.

## Vue boundary

The typed adapter exposes:

- `feedback.notify(...)`;
- `feedback.success(...)`;
- `feedback.info(...)`;
- `feedback.warning(...)`;
- `feedback.error(...)`;
- `feedback.presentError(...)`.

Foreground errors delegate to the canonical visible feedback owner's `reportError` path so technical details remain sanitized and retry actions stay attached to the same visible item. Recoverable background errors may delegate through `TVTrackerCore.feedback.presentError` so the existing classification and non-visible background policy remain authoritative.

## Migrated callers

The first slice moves the existing Vue callers that were directly aware of `window.TVTrackerFeedback` / `window.showToast`:

- Profile Settings;
- Streaming Settings.

No new feedback behavior is invented for Settings components that do not currently own visible feedback.

## Preserved behavior

- Profile success remains `Settings saved`.
- Profile save failure still restores the previous Adult Filter state and offers Retry.
- Streaming validation remains warning feedback.
- Streaming save failure restores the previous region.
- Streaming save success remains `Settings saved`.
- Existing persistence, auth, routing, provider and tracker-data semantics are unchanged.
- `static/js/feedback.js` remains the sole visible feedback renderer.
- `static/js/core/foundation.js` remains the canonical legacy error-classification boundary.

## Tests / exit gates

Phase 5 feedback slice is ready only when:

1. Vue type checking passes.
2. The Vite bundle is rebuilt deterministically and the committed manifest points at the exact generated asset.
3. No Vue component/module outside `frontend/src/ui/feedback.ts` directly references `TVTrackerFeedback` or `showToast`.
4. The adapter contains no DOM-rendering implementation.
5. Existing Phase 7 and Phase 15 unified-feedback contracts remain green.
6. A real Chromium canary triggers Streaming validation through the compiled Vue bundle and observes exactly one warning card in `#tv-feedback-root`.
7. The full repository regression suite passes.
8. PR diff hygiene passes and no temporary build workflow survives the phase.

## Out of scope for this slice

Later Shared UI slices may move dialog primitives, confirmation UI, loading/skeleton primitives, session-expired UI and common pending/save indicators. Those are intentionally not bundled into this first change because each has separate ownership and accessibility contracts.
