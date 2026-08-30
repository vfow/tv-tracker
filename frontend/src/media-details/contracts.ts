export type MediaDetailsKind = "show" | "movie";
export type MediaDetailsPage = "show-detail" | "movie-detail";

export type ShowDetailsTab = "Info" | "Episodes";
export type ShowInfoTab = "Cast" | "Crew" | "Details" | "Genres" | "Releases";
export type MovieDetailsTab = "Info" | "Cast" | "Crew" | "Details" | "Genres" | "Releases";
export type MovieReleaseSort = "date" | "country";

export interface MediaDetailsEntitySummary {
  readonly id: string;
  readonly media: MediaDetailsKind;
  readonly title: string;
  readonly originalTitle: string;
  readonly overview: string;
  readonly posterPath: string;
  readonly backdropPath: string;
  readonly releaseDate: string;
  readonly voteAverage: number | null;
  readonly adult: boolean;
}

export interface ShowDetailsState {
  readonly page: "show-detail";
  readonly selectedId: string;
  readonly preview: boolean;
  readonly activeDetailsTab: ShowDetailsTab;
  readonly activeInfoTab: ShowInfoTab;
  readonly entity: MediaDetailsEntitySummary | null;
}

export interface MovieDetailsState {
  readonly page: "movie-detail";
  readonly selectedId: string;
  readonly routeSlug: string;
  readonly loading: boolean;
  readonly error: string;
  readonly activeDetailsTab: MovieDetailsTab;
  readonly releaseSort: MovieReleaseSort;
  readonly entity: MediaDetailsEntitySummary | null;
}

export type MediaDetailsState = ShowDetailsState | MovieDetailsState;

export function normalizeMediaDetailsId(value: unknown): string {
  const clean = String(value ?? "").trim();
  return /^[1-9][0-9]{0,11}$/.test(clean) ? clean : "";
}

export function normalizeMediaDetailsNumber(value: unknown): number | null {
  if (value === null || value === "" || typeof value === "undefined") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeMediaDetailsText(value: unknown): string {
  return String(value ?? "").trim();
}
