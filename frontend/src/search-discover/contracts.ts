export const SEARCH_MEDIA_TYPES = ['tv', 'movie', 'person', 'collection'] as const;
export type SearchMediaType = (typeof SEARCH_MEDIA_TYPES)[number];

export const DISCOVER_MEDIA_TYPES = ['tv', 'movie'] as const;
export type DiscoverMediaType = (typeof DISCOVER_MEDIA_TYPES)[number];

export type SearchEyeState = Readonly<{
  fadeWatched: boolean;
  hideWatched: boolean;
  hidePlan: boolean;
  hideFavorites: boolean;
}>;

export type SearchRouteState = Readonly<{
  query: string;
  media: SearchMediaType;
  fadeWatched: boolean;
  hideWatched: boolean;
  hidePlan: boolean;
  hideFavorites: boolean;
}>;

export type DiscoverSearchState = Readonly<{
  query: string;
  media: DiscoverMediaType;
  page: number;
  totalPages: number;
  visibleLimit: number;
  loading: boolean;
}>;

export type DiscoverGenre = Readonly<{
  id: number;
  name: string;
}>;

export type DiscoverMediaItem = Readonly<{
  id: number;
  media_type: DiscoverMediaType;
  name: string;
  title: string;
  poster_path: string;
  backdrop_path: string;
  overview: string;
  first_air_date: string;
  release_date: string;
  date: string;
  vote_average: number;
  popularity: number;
  adult: boolean;
}>;

export type DiscoverSection = Readonly<{
  key: string;
  media: DiscoverMediaType;
  category: string;
  title: string;
  section: string;
  route: string;
  items: readonly DiscoverMediaItem[];
  shows: readonly DiscoverMediaItem[];
  hasMore: boolean;
  loadingMore: boolean;
}>;

export type DiscoverHubState = Readonly<{
  loaded: boolean;
  loading: boolean;
  error: string;
  sections: readonly DiscoverSection[];
  genres: Readonly<{
    tv: readonly DiscoverGenre[];
    movie: readonly DiscoverGenre[];
  }>;
  collections: readonly Readonly<Record<string, unknown>>[];
}>;

export type SearchDiscoverSnapshot = Readonly<{
  searchRoute: SearchRouteState;
  discoverSearch: DiscoverSearchState;
  discoverHub: DiscoverHubState;
}>;

export function isSearchMediaType(value: unknown): value is SearchMediaType {
  return typeof value === 'string' && SEARCH_MEDIA_TYPES.some(media => media === value);
}

export function isDiscoverMediaType(value: unknown): value is DiscoverMediaType {
  return typeof value === 'string' && DISCOVER_MEDIA_TYPES.some(media => media === value);
}

export function normalizeSearchMediaType(value: unknown): SearchMediaType {
  return isSearchMediaType(value) ? value : 'tv';
}

export function normalizeDiscoverMediaType(value: unknown): DiscoverMediaType {
  return isDiscoverMediaType(value) ? value : 'tv';
}

export function createDefaultSearchEyeState(): SearchEyeState {
  return Object.freeze({
    fadeWatched: false,
    hideWatched: false,
    hidePlan: false,
    hideFavorites: false
  });
}

export function createDefaultSearchRouteState(): SearchRouteState {
  return Object.freeze({
    query: '',
    media: 'tv',
    ...createDefaultSearchEyeState()
  });
}

export function createDefaultDiscoverSearchState(): DiscoverSearchState {
  return Object.freeze({
    query: '',
    media: 'tv',
    page: 1,
    totalPages: 1,
    visibleLimit: 21,
    loading: false
  });
}

export function createDefaultDiscoverHubState(): DiscoverHubState {
  return Object.freeze({
    loaded: false,
    loading: false,
    error: '',
    sections: Object.freeze([]) as readonly DiscoverSection[],
    genres: Object.freeze({
      tv: Object.freeze([]) as readonly DiscoverGenre[],
      movie: Object.freeze([]) as readonly DiscoverGenre[]
    }),
    collections: Object.freeze([]) as readonly Readonly<Record<string, unknown>>[]
  });
}
