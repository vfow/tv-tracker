<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

import type { EpisodeTrackingState } from './contracts';
import {
  toggleLegacyEpisodeWatched,
  toggleLegacySeasonWatched
} from './legacyEpisodeTrackingActions';
import { readLegacyEpisodeTrackingSnapshot } from './legacyEpisodeTrackingState';

function findEpisodeWatched(state: EpisodeTrackingState, season: number, episode: number): boolean {
  const seasonState = state.seasons.find(item => item.season === season);
  if (!seasonState) return false;
  const episodeState = seasonState.episodes.find(item => item.episode === episode);
  return episodeState?.watched === true || seasonState.watchedEpisodes.includes(episode);
}

function claim(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

async function runWithDisabledButton(button: HTMLButtonElement, action: () => Promise<unknown>): Promise<void> {
  if (button.disabled) return;
  button.disabled = true;
  try {
    await action();
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

function asElement(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null;
}

function handleShowDetailsEpisode(event: MouseEvent, target: Element): boolean {
  const button = target.closest<HTMLButtonElement>('[data-tvtracker-show-details-owner="vue"] .episode-check-button');
  if (!button || button.classList.contains('discover-preview-check-button')) return false;

  const state = readLegacyEpisodeTrackingSnapshot();
  if (!state?.showId) return false;
  const season = Number(button.dataset.season || 0);
  const episode = Number(button.dataset.episode || 0);
  const currentlyWatched = button.dataset.watched === 'true';

  claim(event);
  void runWithDisabledButton(button, () =>
    toggleLegacyEpisodeWatched(state.showId, season, episode, currentlyWatched, button)
  );
  return true;
}

function handleShowDetailsSeason(event: MouseEvent, target: Element): boolean {
  const button = target.closest<HTMLButtonElement>('[data-tvtracker-show-details-owner="vue"] .season-all-button');
  if (!button || button.classList.contains('discover-season-all-button')) return false;

  const state = readLegacyEpisodeTrackingSnapshot();
  if (!state?.showId) return false;
  const season = Number(button.dataset.season || 0);
  const currentlyWatched = button.classList.contains('checked');

  claim(event);
  void runWithDisabledButton(button, () =>
    toggleLegacySeasonWatched(state.showId, season, currentlyWatched, button)
  );
  return true;
}

function handleEpisodeDetailsToggle(event: MouseEvent, target: Element): boolean {
  const button = target.closest<HTMLButtonElement>('#episode-detail-content #episode-toggle-watched-button');
  if (!button) return false;

  const state = readLegacyEpisodeTrackingSnapshot();
  const selected = state?.selectedEpisode;
  if (!state?.showId || !selected) return false;
  const currentlyWatched = findEpisodeWatched(state, selected.season, selected.episode);

  claim(event);
  void runWithDisabledButton(button, () =>
    toggleLegacyEpisodeWatched(state.showId, selected.season, selected.episode, currentlyWatched, button)
  );
  return true;
}

function handleClick(event: MouseEvent): void {
  const target = asElement(event.target);
  if (!target) return;
  if (handleShowDetailsEpisode(event, target)) return;
  if (handleShowDetailsSeason(event, target)) return;
  handleEpisodeDetailsToggle(event, target);
}

onMounted(() => {
  document.addEventListener('click', handleClick, true);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClick, true);
});
</script>

<template>
  <span hidden data-tvtracker-episode-tracking-owner="vue"></span>
</template>
