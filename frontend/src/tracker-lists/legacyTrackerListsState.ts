import {
  TRACKER_LIST_FILTERS,
  TRACKER_LIST_SORTS,
  type TrackerListFilter,
  type TrackerListMovieSummary,
  type TrackerListShowSummary,
  type TrackerListSort,
  type TrackerListsState,
  normalizeTrackerListId,
  normalizeTrackerListNumber,
  normalizeTrackerListText,
  trackerListRouteSlug,
} from "./contracts";

interface LegacyTrackerListsStateBridge {
  readonly ownership: "legacy-read-only";
  snapshot(): unknown;
}

declare global {
  interface Window {
    TVTrackerTrackerListsStateBridge?: LegacyTrackerListsStateBridge;
  }
}

const FILTERS = new Set<TrackerListFilter>(TRACKER_LIST_FILTERS);
const SORTS = new Set<TrackerListSort>(TRACKER_LIST_SORTS);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeFilter(value: unknown): TrackerListFilter {
  const clean = normalizeTrackerListText(value).toLowerCase() as TrackerListFilter;
  return FILTERS.has(clean) ? clean : "watching";
}

function normalizeSort(value: unknown): TrackerListSort {
  const clean = normalizeTrackerListText(value).toLowerCase() as TrackerListSort;
  return SORTS.has(clean) ? clean : "default";
}

function normalizeIdList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const seen = new Set<string>();
  return Object.freeze(
    value
      .map(normalizeTrackerListId)
      .filter((id) => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      }),
  );
}

function normalizeShow(value: unknown): TrackerListShowSummary | null {
  const raw = asRecord(value);
  const id = normalizeTrackerListId(raw.id);
  if (!id) return null;
  return Object.freeze({
    id,
    title: normalizeTrackerListText(raw.title),
    status: normalizeFilter(raw.status),
    posterPath: normalizeTrackerListText(raw.posterPath),
    firstAirDate: normalizeTrackerListText(raw.firstAirDate),
    voteAverage: normalizeTrackerListNumber(raw.voteAverage),
    favorite: raw.favorite === true,
  });
}

function normalizeMovie(value: unknown): TrackerListMovieSummary | null {
  const raw = asRecord(value);
  const id = normalizeTrackerListId(raw.id);
  if (!id) return null;
  return Object.freeze({
    id,
    title: normalizeTrackerListText(raw.title),
    posterPath: normalizeTrackerListText(raw.posterPath),
    releaseDate: normalizeTrackerListText(raw.releaseDate),
    voteAverage: normalizeTrackerListNumber(raw.voteAverage),
    watched: raw.watched === true,
    plan: raw.plan === true,
    favorite: raw.favorite === true,
  });
}

function normalizeShows(value: unknown): readonly TrackerListShowSummary[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.map(normalizeShow).filter((item): item is TrackerListShowSummary => item !== null));
}

function normalizeMovies(value: unknown): readonly TrackerListMovieSummary[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.map(normalizeMovie).filter((item): item is TrackerListMovieSummary => item !== null));
}

export function hasLegacyTrackerListsStateBridge(): boolean {
  return window.TVTrackerTrackerListsStateBridge?.ownership === "legacy-read-only";
}

export function readLegacyTrackerListsSnapshot(): TrackerListsState | null {
  const bridge = window.TVTrackerTrackerListsStateBridge;
  if (!bridge || bridge.ownership !== "legacy-read-only") return null;

  const raw = asRecord(bridge.snapshot());
  const activeFilter = normalizeFilter(raw.activeFilter);
  return Object.freeze({
    page: "shows",
    tab: "watchlist",
    activeFilter,
    routeSlug: trackerListRouteSlug(activeFilter),
    query: normalizeTrackerListText(raw.query),
    genre: normalizeTrackerListText(raw.genre) || "all",
    network: normalizeTrackerListText(raw.network) || "all",
    year: normalizeTrackerListText(raw.year) || "all",
    sort: normalizeSort(raw.sort),
    shows: normalizeShows(raw.shows),
    movies: normalizeMovies(raw.movies),
    favoriteShowIds: normalizeIdList(raw.favoriteShowIds),
    favoriteMovieIds: normalizeIdList(raw.favoriteMovieIds),
  });
}
