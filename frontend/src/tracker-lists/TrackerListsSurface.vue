<script setup lang="ts">
import { ref } from 'vue';

import type {
  TrackerListCardViewModel,
  TrackerListsRendererActions,
  TrackerListsViewModel,
} from './contracts';

const props = defineProps<{
  model: TrackerListsViewModel;
  actions: TrackerListsRendererActions;
}>();

const pendingShowId = ref('');

async function runAction(item: TrackerListCardViewModel, event: MouseEvent): Promise<void> {
  if (!item.action || item.action.disabled || pendingShowId.value) return;
  pendingShowId.value = item.id;
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  try {
    await props.actions.perform(item.action.kind, item.id, target);
  } finally {
    pendingShowId.value = '';
  }
}
</script>

<template>
  <div data-tvtracker-tracker-lists-owner="vue-watchlist" style="display: contents">
    <div v-if="model.emptyState" class="empty-state">
      <h2>{{ model.emptyState.title }}</h2>
      <p>{{ model.emptyState.text }}</p>
    </div>

    <article
      v-for="item in model.items"
      v-else
      :key="item.id"
      :class="['show', 'watchlist-card', `watchlist-card--${item.filter}`]"
      :data-show-id="item.id"
    >
      <a
        class="watchlist-card-link"
        :href="item.route"
        :aria-label="`Open ${item.title || 'show'} details`"
      >
        <img
          v-if="item.posterUrl"
          class="poster"
          :src="item.posterUrl"
          :alt="`${item.title || 'Show'} poster`"
          loading="lazy"
        >
        <div v-else class="poster-placeholder watchlist-poster-placeholder" aria-hidden="true">
          <span>{{ item.posterFallback }}</span>
        </div>

        <div class="info watchlist-info">
          <div class="watchlist-title-row">
            <div class="title">{{ item.title }}</div>
          </div>

          <div class="episode">
            <span v-if="item.completed" class="completed-label">✓ Completed</span>
            <template v-else>{{ item.episodeText }}</template>
          </div>

          <div v-if="item.episodeTitle" class="episode-title">“{{ item.episodeTitle }}”</div>

          <div v-if="item.newBadge" class="watchlist-new-badge-row">
            <span class="new-badge watchlist-new-badge">NEW</span>
          </div>
        </div>
      </a>

      <button
        v-if="item.action"
        type="button"
        :class="['check', 'watchlist-action', `watchlist-action--${item.action.kind}`]"
        :data-watchlist-action="item.action.kind"
        :aria-label="item.action.label"
        :title="item.action.label"
        :disabled="item.action.disabled || pendingShowId === item.id"
        @click.stop="runAction(item, $event)"
      ></button>
    </article>
  </div>
</template>
