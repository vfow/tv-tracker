import {
  type MediaDetailsEntitySummary,
  type MediaDetailsState,
  type MovieDetailsTab,
  type MovieReleaseSort,
  type ShowDetailsTab,
  type ShowInfoTab,
  normalizeMediaDetailsId,
  normalizeMediaDetailsNumber,
  normalizeMediaDetailsText,
} from "./contracts";

interface LegacyMediaDetailsStateBridge {
  readonly ownership: "legacy-read-only";
  snapshot(kind?: "show" | "movie"): unknown;
}

declare global {
  interface Window {
    TVTrackerMediaDetailsStateBridge?: LegacyMediaDetailsStateBridge;
  }
}

const SHOW_DETAILS_TABS = new Set<ShowDetailsTab>(["Info", "Episodes"]);
const SHOW_INFO_TABS = new Set<ShowInfoTab>(["Cast", "Crew", "Details", "Genres", "Releases"]);
const MOVIE_DETAILS_TABS = new Set<MovieDetailsTab>(["Info", "Cast", "Crew", "Details", "Genres", "Releases"]);
const MOVIE_RELEASE_SORTS = new Set<MovieReleaseSort>(["date", "country"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeEntity(value: unknown): MediaDetailsEntitySummary | null {
  const raw = asRecord(value);
  const id = normalizeMediaDetailsId(raw.id);
  if (!id) {
    return null;
  }
  const media = raw.media === "movie" ? "movie" : "show";
  return Object.freeze({
    id,
    media,
    title: normalizeMediaDetailsText(raw.title),
    originalTitle: normalizeMediaDetailsText(raw.originalTitle),
    overview: normalizeMediaDetailsText(raw.overview),
    posterPath: normalizeMediaDetailsText(raw.posterPath),
    backdropPath: normalizeMediaDetailsText(raw.backdropPath),
    releaseDate: normalizeMediaDetailsText(raw.releaseDate),
    voteAverage: normalizeMediaDetailsNumber(raw.voteAverage),
    adult: raw.adult === true,
  });
}

function normalizeShowSnapshot(value: unknown): MediaDetailsState {
  const raw = asRecord(value);
  const detailsTab = normalizeMediaDetailsText(raw.activeDetailsTab) as ShowDetailsTab;
  const infoTab = normalizeMediaDetailsText(raw.activeInfoTab) as ShowInfoTab;
  return Object.freeze({
    page: "show-detail",
    selectedId: normalizeMediaDetailsId(raw.selectedId),
    preview: raw.preview === true,
    activeDetailsTab: SHOW_DETAILS_TABS.has(detailsTab) ? detailsTab : "Info",
    activeInfoTab: SHOW_INFO_TABS.has(infoTab) ? infoTab : "Cast",
    entity: normalizeEntity(raw.entity),
  });
}

function normalizeMovieSnapshot(value: unknown): MediaDetailsState {
  const raw = asRecord(value);
  const detailsTab = normalizeMediaDetailsText(raw.activeDetailsTab) as MovieDetailsTab;
  const releaseSort = normalizeMediaDetailsText(raw.releaseSort) as MovieReleaseSort;
  return Object.freeze({
    page: "movie-detail",
    selectedId: normalizeMediaDetailsId(raw.selectedId),
    routeSlug: normalizeMediaDetailsText(raw.routeSlug),
    loading: raw.loading === true,
    error: normalizeMediaDetailsText(raw.error),
    activeDetailsTab: MOVIE_DETAILS_TABS.has(detailsTab) ? detailsTab : "Info",
    releaseSort: MOVIE_RELEASE_SORTS.has(releaseSort) ? releaseSort : "date",
    entity: normalizeEntity(raw.entity),
  });
}

export function hasLegacyMediaDetailsStateBridge(): boolean {
  return window.TVTrackerMediaDetailsStateBridge?.ownership === "legacy-read-only";
}

export function readLegacyMediaDetailsSnapshot(kind?: "show" | "movie"): MediaDetailsState | null {
  const bridge = window.TVTrackerMediaDetailsStateBridge;
  if (!bridge || bridge.ownership !== "legacy-read-only") {
    return null;
  }
  const snapshot = bridge.snapshot(kind);
  const raw = asRecord(snapshot);
  return raw.page === "movie-detail" ? normalizeMovieSnapshot(raw) : normalizeShowSnapshot(raw);
}
