import {
  type HistoryEntry,
  type HistoryEpisodeEntry,
  type HistoryMovieEntry,
  type HistoryState,
  normalizeHistoryId,
  normalizeHistoryIndex,
  normalizeHistoryText,
} from "./contracts";

interface LegacyHistoryStateBridge {
  readonly ownership: "legacy-read-only";
  snapshot(): unknown;
}

declare global {
  interface Window {
    TVTrackerHistoryStateBridge?: LegacyHistoryStateBridge;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeEpisode(value: unknown): HistoryEpisodeEntry | null {
  const raw = asRecord(value);
  const showId = normalizeHistoryId(raw.showId);
  if (!showId) return null;
  return Object.freeze({
    kind: "episode",
    showId,
    title: normalizeHistoryText(raw.title),
    season: normalizeHistoryIndex(raw.season),
    episode: normalizeHistoryIndex(raw.episode),
    episodeTitle: normalizeHistoryText(raw.episodeTitle),
    watchedAt: normalizeHistoryText(raw.watchedAt),
    airDate: normalizeHistoryText(raw.airDate),
    stillPath: normalizeHistoryText(raw.stillPath),
  });
}

function normalizeMovie(value: unknown): HistoryMovieEntry | null {
  const raw = asRecord(value);
  const movieId = normalizeHistoryId(raw.movieId);
  if (!movieId) return null;
  return Object.freeze({
    kind: "movie",
    movieId,
    title: normalizeHistoryText(raw.title),
    watchedAt: normalizeHistoryText(raw.watchedAt),
    releaseDate: normalizeHistoryText(raw.releaseDate),
    year: normalizeHistoryText(raw.year),
    backdropPath: normalizeHistoryText(raw.backdropPath),
  });
}

function normalizeEntry(value: unknown): HistoryEntry | null {
  const raw = asRecord(value);
  return raw.kind === "movie" ? normalizeMovie(raw) : raw.kind === "episode" ? normalizeEpisode(raw) : null;
}

export function hasLegacyHistoryStateBridge(): boolean {
  return window.TVTrackerHistoryStateBridge?.ownership === "legacy-read-only";
}

export function readLegacyHistorySnapshot(): HistoryState | null {
  const bridge = window.TVTrackerHistoryStateBridge;
  if (!bridge || bridge.ownership !== "legacy-read-only") return null;
  const raw = asRecord(bridge.snapshot());
  const entries = Array.isArray(raw.entries)
    ? raw.entries.map(normalizeEntry).filter((entry): entry is HistoryEntry => entry !== null)
    : [];
  return Object.freeze({
    page: "shows",
    tab: "history",
    entries: Object.freeze(entries),
  });
}
