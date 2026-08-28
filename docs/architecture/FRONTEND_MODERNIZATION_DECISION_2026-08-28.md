# Frontend Modernization Decision — 2026-08-28

Status: approved transition decision for Frontend Modernization Phase 2

Approved production base: `240c38e8a6ae40c204994808652f6d69172e78c5`

This decision formally reopens and supersedes **L-04 Frontend** in `PHASE_11_RISK_REGISTER_ARCHITECTURE_LOCK.md`. All other Phase 11 product, data, security, delivery, and ownership locks remain in force unless separately reopened with explicit approval.

## New L-04 frontend decision

TV Tracker will migrate incrementally to **Vue 3 + Vite + TypeScript**, while retaining **Tailwind** as the styling foundation and **Flask + PostgreSQL** as the application and persistence architecture.

The migration is not a big-bang rewrite. Existing user data, tracker semantics, History, URLs, server APIs, authentication/session behavior, TMDB identity, backup compatibility, optional Push behavior, and optional provider fallback rules remain authoritative.

## Phase 2 scope

Phase 2 establishes tooling and an inactive typed frontend foundation only:

- Vue 3 single-file-component compilation;
- Vite production bundling with hashed output under `static/vue/`;
- strict TypeScript checking with `vue-tsc`;
- a same-origin typed `/api/` client with CSRF handling and request-ID-aware errors;
- reproducible checked-in frontend build artifacts verified by CI and deployment gates.

**Phase 2 does not mount Vue from the production Flask template and does not migrate a product screen.** The existing vanilla application remains the sole runtime owner until a later surface-specific migration is approved and proven.

## Migration rules

1. Migrate one bounded surface at a time.
2. Characterize current behavior before changing ownership.
3. Preserve canonical URLs, direct loads, refresh, Back/Forward, and login return paths.
4. Preserve server APIs and persisted data unless a separate explicit backend/data change is approved.
5. A Vue surface may replace its legacy renderer only after parity tests pass.
6. Remove the old renderer immediately after the new owner is accepted; do not leave permanent dual ownership.
7. Shared concerns move into typed Vue-era boundaries only when their callers and fallback behavior are explicit.
8. No provider metadata may overwrite deliberate tracker truth.
9. Pending writes must not report success before durable acknowledgement.
10. Generated frontend assets and dependency locks are committed and reproducibly rebuilt in CI.

## Rollback

During Phase 2 the Vue bundle is inactive. Rollback is therefore code-only: revert the foundation/tooling commit and generated assets. No schema migration or tracker-data rollback is required.

For later surface migrations, each PR must identify the legacy owner being replaced, the rollback point, browser/data acceptance tests, and the exact condition under which the legacy implementation is deleted.

## Target architecture

- Backend/runtime: Flask
- Primary store: PostgreSQL
- Frontend: Vue 3 + TypeScript
- Frontend build: Vite
- Styling: Tailwind
- Canonical media identity: TMDB
- Optional enrichment: TVmaze or equivalent provider-neutral release timing
- Notifications: persisted in-app state first, optional Push second
- Delivery: exact-SHA CI/deploy/health verification

This document supersedes only the previous vanilla-JavaScript target in L-04; it does not weaken any data-integrity, security, observability, migration, or release gate.
