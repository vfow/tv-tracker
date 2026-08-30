import {
  normalizeDiscoverMediaType,
  type DiscoverGenre,
  type DiscoverHubState,
  type DiscoverMediaItem,
  type DiscoverSection
} from './contracts';

type LegacyDiscoverStateSnapshot = Readonly<Record<string, unknown>>;

type LegacyDiscoverStateBridge = Readonly<{
  snapshot: () => LegacyDiscoverStateSnapshot;
  ownership: 'legacy-read-only';
}>;

declare global {
  interface Window {
    TVTrackerDiscoverStateBridge?: LegacyDiscoverStateBridge;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeGenre(value: unknown): DiscoverGenre {
  const genre = asRecord(value);
  return Object.freeze({
    id: asNumber(genre.id),
    name: String(genre.name ?? '')
  });
}

function normalizeMediaItem(value: unknown, fallbackMedia: unknown): DiscoverMediaItem {
  const item = asRecord(value);
  return Object.freeze({
    id: asNumber(item.id),
    media_type: normalizeDiscoverMediaType(item.media_type ?? fallbackMedia),
    name: String(item.name ?? ''),
    title: String(item.title ?? ''),
    poster_path: String(item.poster_path ?? ''),
    backdrop_path: String(item.backdrop_path ?? ''),
    overview: String(item.overview ?? ''),
    first_air_date: String(item.first_air_date ?? ''),
    release_date: String(item.release_date ?? ''),
    date: String(item.date ?? ''),
    vote_average: asNumber(item.vote_average),
    popularity: asNumber(item.popularity),
    adult: item.adult === true
  });
}

function normalizeSection(value: unknown): DiscoverSection {
  const section = asRecord(value);
  const media = normalizeDiscoverMediaType(section.media);
  return Object.freeze({
    key: String(section.key ?? ''),
    media,
    category: String(section.category ?? ''),
    title: String(section.title ?? ''),
    section: String(section.section ?? ''),
    route: String(section.route ?? ''),
    items: Object.freeze(asArray(section.items).map(item => normalizeMediaItem(item, media))),
    shows: Object.freeze(asArray(section.shows).map(item => normalizeMediaItem(item, media))),
    hasMore: section.hasMore === true,
    loadingMore: section.loadingMore === true
  });
}

function copyCollection(value: unknown): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...asRecord(value) });
}

export function hasLegacyDiscoverStateBridge(): boolean {
  const bridge = window.TVTrackerDiscoverStateBridge;
  return bridge?.ownership === 'legacy-read-only' && typeof bridge.snapshot === 'function';
}

export function readLegacyDiscoverHubSnapshot(): DiscoverHubState | null {
  const bridge = window.TVTrackerDiscoverStateBridge;
  if (!bridge || typeof bridge.snapshot !== 'function') return null;

  const snapshot = asRecord(bridge.snapshot());
  const genres = asRecord(snapshot.genres);
  return Object.freeze({
    loaded: snapshot.loaded === true,
    loading: snapshot.loading === true,
    error: String(snapshot.error ?? ''),
    sections: Object.freeze(asArray(snapshot.sections).map(normalizeSection)),
    genres: Object.freeze({
      tv: Object.freeze(asArray(genres.tv).map(normalizeGenre)),
      movie: Object.freeze(asArray(genres.movie).map(normalizeGenre))
    }),
    collections: Object.freeze(asArray(snapshot.collections).map(copyCollection))
  });
}
