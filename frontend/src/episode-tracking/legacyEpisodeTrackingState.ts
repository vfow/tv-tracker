import {
  type EpisodeTrackingEpisodeState,
  type EpisodeTrackingSeasonState,
  type EpisodeTrackingSelectedEpisodeState,
  type EpisodeTrackingState,
  normalizeEpisodeTrackingId,
  normalizeEpisodeTrackingIndex,
  normalizeEpisodeTrackingNumbers,
  normalizeEpisodeTrackingText,
} from "./contracts";

interface LegacyEpisodeTrackingStateBridge {
  readonly ownership: "legacy-read-only";
  snapshot(showId?: unknown): unknown;
}

declare global {
  interface Window {
    TVTrackerEpisodeTrackingStateBridge?: LegacyEpisodeTrackingStateBridge;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeEpisode(value: unknown): EpisodeTrackingEpisodeState | null {
  const raw = asRecord(value);
  const episode = normalizeEpisodeTrackingIndex(raw.episode);
  if (episode <= 0) return null;
  return Object.freeze({
    season: normalizeEpisodeTrackingIndex(raw.season),
    episode,
    title: normalizeEpisodeTrackingText(raw.title),
    airDate: normalizeEpisodeTrackingText(raw.airDate),
    watched: raw.watched === true,
    loggable: raw.loggable === true,
    special: raw.special === true,
  });
}

function normalizeSeason(value: unknown): EpisodeTrackingSeasonState {
  const raw = asRecord(value);
  const episodes = Array.isArray(raw.episodes)
    ? raw.episodes.map(normalizeEpisode).filter((episode): episode is EpisodeTrackingEpisodeState => episode !== null)
    : [];
  return Object.freeze({
    season: normalizeEpisodeTrackingIndex(raw.season),
    watchedEpisodes: normalizeEpisodeTrackingNumbers(raw.watchedEpisodes),
    episodes: Object.freeze(episodes),
    allLoggableWatched: raw.allLoggableWatched === true,
  });
}

function normalizeSelectedEpisode(value: unknown, showId: string): EpisodeTrackingSelectedEpisodeState | null {
  const raw = asRecord(value);
  const selectedShowId = normalizeEpisodeTrackingId(raw.showId);
  const episode = normalizeEpisodeTrackingIndex(raw.episode);
  if (!selectedShowId || selectedShowId !== showId || episode <= 0) return null;
  return Object.freeze({
    showId: selectedShowId,
    season: normalizeEpisodeTrackingIndex(raw.season),
    episode,
  });
}

export function hasLegacyEpisodeTrackingStateBridge(): boolean {
  return window.TVTrackerEpisodeTrackingStateBridge?.ownership === "legacy-read-only";
}

export function readLegacyEpisodeTrackingSnapshot(showId?: unknown): EpisodeTrackingState | null {
  const bridge = window.TVTrackerEpisodeTrackingStateBridge;
  if (!bridge || bridge.ownership !== "legacy-read-only") return null;
  const raw = asRecord(bridge.snapshot(showId));
  const normalizedShowId = normalizeEpisodeTrackingId(raw.showId);
  const seasons = Array.isArray(raw.seasons) ? raw.seasons.map(normalizeSeason) : [];
  return Object.freeze({
    showId: normalizedShowId,
    title: normalizeEpisodeTrackingText(raw.title),
    status: normalizeEpisodeTrackingText(raw.status),
    completedAt: normalizeEpisodeTrackingText(raw.completedAt),
    seasons: Object.freeze(seasons),
    selectedEpisode: normalizeSelectedEpisode(raw.selectedEpisode, normalizedShowId),
  });
}
