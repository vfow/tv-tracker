export interface EpisodeTrackingEpisodeState {
  readonly season: number;
  readonly episode: number;
  readonly title: string;
  readonly airDate: string;
  readonly watched: boolean;
  readonly loggable: boolean;
  readonly special: boolean;
}

export interface EpisodeTrackingSeasonState {
  readonly season: number;
  readonly watchedEpisodes: readonly number[];
  readonly episodes: readonly EpisodeTrackingEpisodeState[];
  readonly allLoggableWatched: boolean;
}

export interface EpisodeTrackingSelectedEpisodeState {
  readonly showId: string;
  readonly season: number;
  readonly episode: number;
}

export interface EpisodeTrackingState {
  readonly showId: string;
  readonly title: string;
  readonly status: string;
  readonly completedAt: string;
  readonly seasons: readonly EpisodeTrackingSeasonState[];
  readonly selectedEpisode: EpisodeTrackingSelectedEpisodeState | null;
}

export function normalizeEpisodeTrackingText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeEpisodeTrackingId(value: unknown): string {
  const clean = normalizeEpisodeTrackingText(value);
  return /^[1-9][0-9]{0,11}$/.test(clean) ? clean : "";
}

export function normalizeEpisodeTrackingIndex(value: unknown): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

export function normalizeEpisodeTrackingNumbers(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const numbers = value
    .map(normalizeEpisodeTrackingIndex)
    .filter((number) => number > 0);
  return Object.freeze(Array.from(new Set(numbers)).sort((left, right) => left - right));
}
