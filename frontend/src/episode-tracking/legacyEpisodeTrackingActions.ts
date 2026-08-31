import { normalizeEpisodeTrackingId, normalizeEpisodeTrackingIndex } from './contracts';

interface LegacyEpisodeTrackingWindow extends Window {
  updateEpisodeWatched?: (showId: string, season: number, episode: number, watched: boolean) => Promise<unknown> | unknown;
  markSeasonWatched?: (showId: string, season: number) => Promise<unknown> | unknown;
  markNextEpisode?: (showId: string) => Promise<unknown> | unknown;
  playCheckSuccessAnimation?: (element: Element) => Promise<unknown> | unknown;
}

export type EpisodeTrackingActionResult = 'handled' | 'unavailable' | 'invalid';

function legacyWindow(): LegacyEpisodeTrackingWindow {
  return window as LegacyEpisodeTrackingWindow;
}

async function animate(element: Element | null, enabled: boolean): Promise<void> {
  const legacy = legacyWindow();
  if (!enabled || !element || typeof legacy.playCheckSuccessAnimation !== 'function') return;
  await legacy.playCheckSuccessAnimation(element);
}

export async function toggleLegacyEpisodeWatched(
  showIdValue: unknown,
  seasonValue: unknown,
  episodeValue: unknown,
  currentlyWatched: boolean,
  element: Element | null = null
): Promise<EpisodeTrackingActionResult> {
  const showId = normalizeEpisodeTrackingId(showIdValue);
  const season = normalizeEpisodeTrackingIndex(seasonValue);
  const episode = normalizeEpisodeTrackingIndex(episodeValue);
  if (!showId || episode <= 0) return 'invalid';

  const legacy = legacyWindow();
  if (typeof legacy.updateEpisodeWatched !== 'function') return 'unavailable';

  await animate(element, !currentlyWatched);
  await legacy.updateEpisodeWatched(showId, season, episode, !currentlyWatched);
  return 'handled';
}

export async function toggleLegacySeasonWatched(
  showIdValue: unknown,
  seasonValue: unknown,
  currentlyWatched: boolean,
  element: Element | null = null
): Promise<EpisodeTrackingActionResult> {
  const showId = normalizeEpisodeTrackingId(showIdValue);
  const season = normalizeEpisodeTrackingIndex(seasonValue);
  if (!showId) return 'invalid';

  const legacy = legacyWindow();
  if (typeof legacy.markSeasonWatched !== 'function') return 'unavailable';

  await animate(element, !currentlyWatched);
  await legacy.markSeasonWatched(showId, season);
  return 'handled';
}

export async function markLegacyNextEpisode(
  showIdValue: unknown,
  element: Element | null = null
): Promise<EpisodeTrackingActionResult> {
  const showId = normalizeEpisodeTrackingId(showIdValue);
  if (!showId) return 'invalid';

  const legacy = legacyWindow();
  if (typeof legacy.markNextEpisode !== 'function') return 'unavailable';

  await animate(element, true);
  await legacy.markNextEpisode(showId);
  return 'handled';
}
