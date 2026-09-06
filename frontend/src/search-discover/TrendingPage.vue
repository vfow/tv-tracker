<script setup lang="ts">
import type { DiscoverListingItem, TrendingActions, TrendingViewModel } from './discoverViewModel';

const props = defineProps<{ model: TrendingViewModel; actions: TrendingActions }>();

function openMedia(event: MouseEvent, item: DiscoverListingItem): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  event.stopPropagation();
  void props.actions.openMedia(item, props.model.key);
}
</script>

<template>
  <div class="genre-detail-page-inner trending-page-inner" data-tvtracker-trending-owner="vue">
    <div class="genre-detail-header trending-page-header">
      <button type="button" class="show-page-back-button genre-page-back-button" id="trending-page-back-button" aria-label="Back" @click="actions.back">
        <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
      </button>
      <div><h1 class="genre-detail-title">{{ model.title }}</h1></div>
    </div>
    <div class="genre-result-content">
      <div v-if="model.bodyState === 'error'" class="empty-state genre-detail-empty">
        <h2>Trending could not load</h2><p>{{ model.error }}</p>
      </div>
      <div v-else-if="model.bodyState === 'ready'" class="genre-tight-grid">
        <a v-for="item in model.items" :key="`${item.media}:${item.id}`" :href="item.route"
          class="genre-result-card trending-result-card" :class="{ 'eye-filter-faded': item.faded }"
          :data-media-type="item.media" :data-media-id="item.id" :data-show-id="item.media === 'tv' ? item.id : ''"
          :data-media-name="item.name" :data-show-name="item.name" :data-poster-path="item.posterPath"
          :data-overview="item.overview" :data-first-air-date="item.firstAirDate" @click="openMedia($event, item)">
          <div class="genre-result-poster">
            <img v-if="item.posterUrl" loading="lazy" decoding="async" :src="item.posterUrl" :alt="`${item.name} poster`">
            <div v-else class="genre-card-placeholder media-title-placeholder" :title="item.placeholderLabel"><span>{{ item.placeholderLabel }}</span></div>
          </div>
          <div class="genre-result-title">{{ item.name }}</div>
          <div class="genre-result-meta">{{ item.year }}<template v-if="item.rating"> • {{ item.rating }}</template><template v-if="item.adult"> • <span class="adult-movie-badge">ADULT</span></template></div>
        </a>
      </div>
      <div v-else-if="model.bodyState === 'loading'" class="genre-tight-grid genre-tight-grid-loading" role="status" aria-label="Loading trending titles">
        <div v-for="index in 12" :key="index" class="tt-skeleton-poster-card" aria-hidden="true">
          <div class="tt-skeleton-poster"></div><div class="tt-skeleton-line tt-skeleton-line-title"></div><div class="tt-skeleton-line tt-skeleton-line-meta"></div>
        </div>
      </div>
      <div v-else class="empty-state genre-detail-empty"><h2>No trending titles found</h2><p>Try again later.</p></div>
    </div>
  </div>
</template>
