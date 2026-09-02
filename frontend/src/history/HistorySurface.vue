<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

import type { HistoryRendererActions, HistoryViewModel } from './contracts';

const props = defineProps<{
  model: HistoryViewModel;
  actions: HistoryRendererActions;
}>();

const loadingMore = ref(false);
const ownerMarker = ref<HTMLElement | null>(null);

onBeforeUnmount(() => {
  ownerMarker.value?.parentElement?.removeAttribute('data-tvtracker-history-owner');
});

async function loadMore(): Promise<void> {
  if (loadingMore.value) return;
  loadingMore.value = true;
  try {
    await props.actions.loadMore();
  } finally {
    loadingMore.value = false;
  }
}
</script>

<template>
  <div ref="ownerMarker" data-tvtracker-history-owner="vue-history" style="display: contents">
    <div
      v-if="model.state === 'loading'"
      class="watchlist-initial-skeleton history-initial-skeleton"
      role="status"
      aria-live="polite"
      aria-label="Loading watch history"
    >
      <article
        v-for="rowIndex in model.loadingRowCount"
        :key="rowIndex"
        class="show history-entry-card"
        aria-hidden="true"
      >
        <div class="history-still watchlist-skeleton-block"></div>
        <div class="info watchlist-skeleton-content">
          <div :class="`watchlist-skeleton-block watchlist-skeleton-title watchlist-skeleton-title--${((rowIndex - 1) % 5) + 1}`"></div>
          <div :class="`watchlist-skeleton-block watchlist-skeleton-episode watchlist-skeleton-episode--${((rowIndex - 1) % 5) + 1}`"></div>
        </div>
        <div class="history-time">
          <div :class="`watchlist-skeleton-block watchlist-skeleton-meta watchlist-skeleton-meta--${((rowIndex - 1) % 5) + 1}`"></div>
        </div>
      </article>
      <span class="watchlist-skeleton-sr">Loading watch history…</span>
    </div>

    <div
      v-else-if="model.state === 'error'"
      class="empty-state"
      data-tvtracker-history-model-projection-failed="true"
      role="alert"
    >
      <h2>History unavailable</h2>
      <p>Reload the page to try again.</p>
    </div>

    <div v-else-if="model.emptyState" class="empty-state">
      <h2>{{ model.emptyState.title }}</h2>
      <p>{{ model.emptyState.text }}</p>
    </div>

    <template v-else>
      <div v-for="group in model.groups" :key="group.key" class="history-group">
        <div class="history-group-title">{{ group.label }}</div>

        <a
          v-for="entry in group.entries"
          :key="entry.key"
          class="show history-entry-card"
          :href="entry.route"
        >
          <img
            v-if="entry.imageUrl"
            class="history-still"
            loading="lazy"
            decoding="async"
            :src="entry.imageUrl"
            :alt="`${entry.title} artwork`"
          >
          <div v-else class="history-still-placeholder" aria-hidden="true">{{ entry.placeholder }}</div>

          <div class="info">
            <div class="title">{{ entry.title }}</div>
            <div v-if="entry.detailLine" class="history-episode-line">{{ entry.detailLine }}</div>
          </div>

          <div class="history-time">{{ entry.relativeTime }}</div>
        </a>
      </div>
    </template>

    <button
      v-if="model.state === 'ready' && model.hasMore"
      type="button"
      class="history-load-more"
      :disabled="loadingMore"
      @click="loadMore"
    >
      {{ loadingMore ? 'Loading…' : 'Load More' }}
    </button>
  </div>
</template>
