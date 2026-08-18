# Phase 2 Recheck — Repository and Dependency Map

Status: authoritative correction to stale current-state wording in `PHASE_2_DEPENDENCY_MAP.md`

Baseline main SHA: `d524c905c11101566c0493053e5414649ea6b105`

Audit branch: `architecture-futureproof-2026-08-18`

Date: 2026-08-18

This recheck exists because later stabilization work changed two assumptions that were still described as current in the original Phase 2 dependency map. The original dependency map remains useful as a historical ownership/removal-condition record, but this file is authoritative wherever the two documents disagree about current CI or frontend target architecture.

## Correction 1 — CI no longer transforms source before testing

The original Phase 2 document correctly identified the temporary Wave 2 CI source transform as unacceptable final-state machinery. That temporary mechanism has now been removed.

Current CI contract:

- workflow permissions are `contents: read`;
- CI does not apply `tools/apply_architecture_wave2.py` or any other source-rewrite step;
- CI tests the checked-in branch contents directly;
- production npm dependency security is checked separately;
- the full Python/Node regression suite runs through `python tests/run_all.py`;
- `git diff --check` runs after tests.

Permanent invariant:

> CI must test the source tree that is actually proposed for review. It must never silently transform repository source into a different version before testing.

Any historical wording in `PHASE_2_DEPENDENCY_MAP.md` that says the branch currently contains an `Apply architecture wave 2` CI step is superseded by this correction.

## Correction 2 — Vue/Vite/TypeScript is not the stabilization target

The original dependency map discussed introducing Vue/Vite assets as though that were an expected later migration step. The subsequent risk audit showed that a framework rewrite during this stabilization batch would increase data-integrity, routing, deployment, and ownership risk without being necessary to satisfy the product requirements.

Current architecture decision for this stabilization batch:

- keep Flask as the server/runtime foundation;
- keep PostgreSQL as the primary server-side persistent store;
- keep the current browser application architecture operational while migrating ownership domain-by-domain;
- prefer explicit modular vanilla-JavaScript/browser-native boundaries over a big-bang frontend rewrite;
- remove globals, monkey patches, duplicate render ownership, load-order dependencies, and compatibility shims incrementally only after replacement ownership and regression coverage exist;
- do not introduce Vue, Vite, React, Next.js, TypeScript, or another framework merely to make the repository look modern;
- a framework/build-system migration remains a future option only if a later independent evaluation demonstrates a concrete product, maintainability, accessibility, or deployment benefit that outweighs migration risk.

This decision does not prohibit future framework adoption. It prohibits assuming one before the existing user-data and ownership debt is resolved.

## Current Phase 2 dependency conclusions after recheck

The core conclusions of the original dependency map remain valid:

1. `app.py` and `static/js/db.js` remain the highest data/persistence blast-radius owners.
2. `app.js` and `ui.js` still contain large global ownership surfaces that should shrink incrementally.
3. `index.html` remains the classic-script composition root and script-order coupling must be removed carefully.
4. Historical integrity/fix files are behavioral evidence, not deletion candidates.
5. Canonical Python package boundaries under `tvtracker/` are the correct transition direction.
6. Root Python compatibility shims are temporary and must disappear only after all callers/tests are package-native.
7. TVmaze remains an optional provider boundary and TMDB ID remains canonical media identity.
8. Push remains subordinate to Notifications and cannot become required for notification persistence.
9. Settings, Adult Filter, and shared feedback are transition domains with explicit owners; duplicate legacy ownership must be removed only after coverage proves equivalence.
10. Provider/cache state must remain removable without affecting tracker/history/profile state.

## No-guessing rule established by this recheck

Future architecture documentation must distinguish four categories explicitly:

- **observed current state** — verified from the current branch/source/configuration;
- **locked product requirement** — explicitly decided for TV Tracker;
- **transition decision** — an engineering choice adopted for this batch;
- **future option** — not assumed, not scheduled, and not presented as the target architecture until separately justified.

Vue/Vite/TypeScript is now classified only as a **future option**. The current read-only CI workflow is an **observed current state**.

## Phase 2 recheck exit statement

The two stale assumptions identified during the 2026-08-18 strict re-audit are now explicitly corrected without changing runtime behavior. The original dependency map plus this authoritative correction provide a consistent basis for Phase 3 data-integrity repair.
