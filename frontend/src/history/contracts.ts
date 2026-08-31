export interface HistoryEpisodeEntry {
  readonly kind: "episode";
  readonly showId: string;
  readonly title: string;
  readonly season: number;
  readonly episode: number;
  readonly episodeTitle: string;
  readonly watchedAt: string;
  readonly airDate: string;
  readonly stillPath: string;
}

export interface HistoryMovieEntry {
  readonly kind: "movie";
  readonly movieId: string;
  readonly title: string;
  readonly watchedAt: string;
  readonly releaseDate: string;
  readonly year: string;
  readonly backdropPath: string;
}

export type HistoryEntry = HistoryEpisodeEntry | HistoryMovieEntry;

export interface HistoryState {
  readonly page: "shows";
  readonly tab: "history";
  readonly entries: readonly HistoryEntry[];
}

export function normalizeHistoryText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeHistoryId(value: unknown): string {
  const clean = normalizeHistoryText(value);
  return /^[1-9][0-9]{0,11}$/.test(clean) ? clean : "";
}

export function normalizeHistoryIndex(value: unknown): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}
