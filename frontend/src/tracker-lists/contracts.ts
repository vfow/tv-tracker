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
