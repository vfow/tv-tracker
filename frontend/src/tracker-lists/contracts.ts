export type TrackerListFilter = "watching" | "paused" | "finished" | "plan" | "dropped";
export type TrackerListRouteSlug = "watching" | "paused" | "completed" | "plan-to-watch" | "dropped";
export type TrackerListSort =
  | "default"
  | "title-az"
  | "title-za"
  | "recently-added"
  | "recently-watched"
  | "rating-desc"
  | "year-newest"
  | "year-oldest";

export interface TrackerListShowSummary {
  readonly id: string;
  readonly title: string;
  readonly status: TrackerListFilter;
  readonly posterPath: string;
  readonly firstAirDate: string;
  readonly voteAverage: number | null;
  readonly favorite: boolean;
}

export interface TrackerListMovieSummary {
  readonly id: string;
  readonly title: string;
  readonly posterPath: string;
  readonly releaseDate: string;
  readonly voteAverage: number | null;
  readonly watched: boolean;
  readonly plan: boolean;
  readonly favorite: boolean;
}

export interface TrackerListsState {
  readonly page: "shows";
  readonly tab: "watchlist";
  readonly activeFilter: TrackerListFilter;
  readonly routeSlug: TrackerListRouteSlug;
  readonly query: string;
  readonly genre: string;
  readonly network: string;
  readonly year: string;
  readonly sort: TrackerListSort;
  readonly shows: readonly TrackerListShowSummary[];
  readonly movies: readonly TrackerListMovieSummary[];
  readonly favoriteShowIds: readonly string[];
  readonly favoriteMovieIds: readonly string[];
}

export type TrackerListActionKind = "mark" | "watching";

export interface TrackerListActionViewModel {
  readonly kind: TrackerListActionKind;
  readonly label: string;
  readonly disabled: boolean;
}

export interface TrackerListCardViewModel {
  readonly id: string;
  readonly filter: TrackerListFilter;
  readonly title: string;
  readonly route: string;
  readonly posterUrl: string;
  readonly posterFallback: string;
  readonly episodeText: string;
  readonly completed: boolean;
  readonly episodeTitle: string;
  readonly newBadge: boolean;
  readonly action: TrackerListActionViewModel | null;
}

export interface TrackerListEmptyViewModel {
  readonly title: string;
  readonly text: string;
}

export interface TrackerListsViewModel {
  readonly surface: "watchlist";
  readonly activeFilter: TrackerListFilter;
  readonly routeSlug: TrackerListRouteSlug;
  readonly query: string;
  readonly items: readonly TrackerListCardViewModel[];
  readonly emptyState: TrackerListEmptyViewModel | null;
}

export interface TrackerListsRendererActions {
  perform(kind: TrackerListActionKind, showId: string, target: HTMLElement | null): Promise<void>;
}

export interface TrackerListsVueOwner {
  render(model: TrackerListsViewModel): void;
  unmount(): void;
}

export interface TrackerListsVueBridge {
  readonly ownership: "vue-dom";
  readonly actions: TrackerListsRendererActions;
  attachVueOwner(owner: TrackerListsVueOwner): void;
  renderWatchlist(): Promise<boolean>;
  refreshWatchlistShows(showIds?: readonly string[]): Promise<boolean>;
}

export const TRACKER_LIST_FILTERS = Object.freeze<readonly TrackerListFilter[]>([
  "watching",
  "paused",
  "finished",
  "plan",
  "dropped",
]);

export const TRACKER_LIST_SORTS = Object.freeze<readonly TrackerListSort[]>([
  "default",
  "title-az",
  "title-za",
  "recently-added",
  "recently-watched",
  "rating-desc",
  "year-newest",
  "year-oldest",
]);

export function normalizeTrackerListText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeTrackerListId(value: unknown): string {
  const clean = normalizeTrackerListText(value);
  return /^[1-9][0-9]{0,11}$/.test(clean) ? clean : "";
}

export function normalizeTrackerListNumber(value: unknown): number | null {
  if (value === null || value === "" || typeof value === "undefined") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function trackerListRouteSlug(filter: TrackerListFilter): TrackerListRouteSlug {
  if (filter === "finished") return "completed";
  if (filter === "plan") return "plan-to-watch";
  return filter;
}
