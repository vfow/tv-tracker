import { normalizeSearchMediaType, type SearchRouteState } from './contracts';

type LegacySearchStateSnapshot = Readonly<{
  query?: unknown;
  media?: unknown;
  fadeWatched?: unknown;
  hideWatched?: unknown;
  hidePlan?: unknown;
  hideFavorites?: unknown;
}>;

type LegacySearchStateBridge = Readonly<{
  snapshot: () => LegacySearchStateSnapshot;
  ownership: 'legacy-read-only';
}>;

declare global {
  interface Window {
    TVTrackerSearchStateBridge?: LegacySearchStateBridge;
  }
}

export function hasLegacySearchStateBridge(): boolean {
  const bridge = window.TVTrackerSearchStateBridge;
  return bridge?.ownership === 'legacy-read-only' && typeof bridge.snapshot === 'function';
}

export function readLegacySearchStateSnapshot(): SearchRouteState | null {
  const bridge = window.TVTrackerSearchStateBridge;
  if (!bridge || typeof bridge.snapshot !== 'function') return null;

  const snapshot = bridge.snapshot();
  return Object.freeze({
    query: String(snapshot.query ?? ''),
    media: normalizeSearchMediaType(snapshot.media),
    fadeWatched: snapshot.fadeWatched === true,
    hideWatched: snapshot.hideWatched === true,
    hidePlan: snapshot.hidePlan === true,
    hideFavorites: snapshot.hideFavorites === true
  });
}
