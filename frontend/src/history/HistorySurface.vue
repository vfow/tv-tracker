<script setup lang="ts">
import { ref } from 'vue';

import type { HistoryRendererActions, HistoryViewModel } from './contracts';

const props = defineProps<{
  model: HistoryViewModel;
  actions: HistoryRendererActions;
}>();

const loadingMore = ref(false);

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
  <div data-tvtracker-history-owner="vue-history" style="display: contents">
    <div v-if="model.emptyState" class="empty-state">
      <h2>{{ model.emptyState.title }}</h2>
      <p>{{ model.emptyState.text }}</p>
    </div>

    <div v-for="group in model.groups" v-else :key="group.key" class="history-group">
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

    <button
      v-if="model.hasMore"
      type="button"
      class="history-load-more"
      :disabled="loadingMore"
      @click="loadMore"
    >
      {{ loadingMore ? 'Loading…' : 'Load More' }}
    </button>
  </div>
</template>
