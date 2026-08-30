<script setup lang="ts">
import { computed } from 'vue';

import type { DiscoverMediaType } from './contracts';
import type {
  DiscoverPosterItem,
  DiscoverRendererActions,
  DiscoverRow,
  DiscoverViewModel
} from './discoverViewModel';

const props = defineProps<{
  model: DiscoverViewModel;
  actions: DiscoverRendererActions;
}>();

const loadingGroups = Object.freeze(['TV Shows', 'Movies', 'Collections'] as const);

const mediaGroups = computed(() => Object.freeze([
  Object.freeze({ key: 'tv', title: 'TV Shows', rows: props.model.tvRows }),
  Object.freeze({ key: 'movie', title: 'Movies', rows: props.model.movieRows })
]));

function isPlainAppClick(event: MouseEvent): boolean {
  return !event.defaultPrevented
    && event.button === 0
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey;
}

function handleMediaClick(event: MouseEvent, item: DiscoverPosterItem): void {
  if (!isPlainAppClick(event)) return;
  event.preventDefault();
  void props.actions.openMedia(item);
}

function setGenreMedia(media: DiscoverMediaType): void {
  props.actions.setGenreMedia(media);
}

function rowKey(row: DiscoverRow, group: string): string {
  return `${group}:${row.key || row.title}`;
}
</script>

<template>
  <div class="discover-page-shell" data-tvtracker-discover-owner="vue">
    <template v-if="model.bodyState === 'loading'">
      <section v-for="title in loadingGroups" :key="title" class="discover-section-group">
        <h2 class="discover-group-title">{{ title }}</h2>
        <div class="discover-section">
          <div class="discover-card-row discover-card-row-loading" :aria-label="`Loading ${title}`">
            <div v-for="index in 8" :key="index" class="tt-skeleton-poster-card" aria-hidden="true">
              <div class="tt-skeleton-poster"></div>
              <div class="tt-skeleton-line tt-skeleton-line-title"></div>
              <div class="tt-skeleton-line tt-skeleton-line-meta"></div>
            </div>
          </div>
        </div>
      </section>
    </template>

    <div v-else-if="model.bodyState === 'error'" class="empty-state search-empty-state">
      <h2>Discover failed to load</h2>
      <p>Couldn’t load this page. Try again later.</p>
    </div>

    <template v-else>
      <section
        v-for="group in mediaGroups"
        v-show="group.rows.length"
        :key="group.key"
        class="discover-section-group"
      >
        <h2 class="discover-group-title">{{ group.title }}</h2>
        <section v-for="row in group.rows" :key="rowKey(row, group.key)" class="discover-section">
          <div class="discover-section-heading">
            <h3>{{ row.title || 'Browse' }}</h3>
            <a v-if="row.route" class="view-more-button discover-view-more-link" :href="row.route">VIEW MORE</a>
          </div>
          <div class="discover-carousel-shell">
            <div class="discover-card-row" :data-discover-row="row.key || row.title || 'row'">
              <a
                v-for="item in row.items"
                :key="`${item.media}:${item.id}`"
                :href="item.route"
                class="discover-hub-card"
                :data-media-type="item.media"
                :data-media-id="item.id"
                :data-media-name="item.name"
                :data-poster-path="item.posterPath"
                :data-overview="item.overview"
                :data-first-air-date="item.firstAirDate"
                :data-release-date="item.releaseDate"
                @click="handleMediaClick($event, item)"
              >
                <div class="discover-card-poster">
                  <img v-if="item.posterUrl" loading="lazy" decoding="async" :src="item.posterUrl" :alt="`${item.name} poster`">
                  <div v-else class="discover-card-placeholder media-title-placeholder" :title="item.placeholderLabel">
                    <span>{{ item.placeholderLabel }}</span>
                  </div>
                </div>
                <div class="discover-card-title">{{ item.name }}</div>
                <div class="discover-card-meta">
                  {{ item.year }}<template v-if="item.adult"> • <span class="adult-movie-badge">ADULT</span></template>
                </div>
              </a>
            </div>
          </div>
        </section>
      </section>

      <section v-if="model.collections.length" class="discover-section-group discover-collections-section">
        <div class="discover-section-heading discover-collections-heading">
          <h2 class="discover-group-title">Collections</h2>
          <a class="view-more-button discover-view-more-link" href="/app/collections">VIEW MORE</a>
        </div>
        <section class="discover-section">
          <div class="discover-carousel-shell">
            <div class="discover-card-row discover-collection-row" data-discover-row="collections">
              <a
                v-for="item in model.collections"
                :key="`collection:${item.id}`"
                :href="item.route"
                class="collection-card discover-collection-card"
                :data-collection-id="item.id"
                :data-collection-name="item.name"
              >
                <div
                  v-if="item.posterSlots.length"
                  class="collection-poster-stack"
                  :class="`collection-poster-count-${item.posterSlots.length}`"
                  aria-hidden="true"
                >
                  <div
                    v-for="(slot, index) in item.posterSlots"
                    :key="`${item.id}:${index}:${slot.label}`"
                    class="collection-stack-poster"
                    :class="[`collection-stack-poster-${index + 1}`, { 'collection-stack-placeholder': !slot.imageUrl }]"
                    :title="slot.label"
                  >
                    <img v-if="slot.imageUrl" loading="lazy" decoding="async" :src="slot.imageUrl" :alt="`${item.name} poster`">
                  </div>
                </div>
                <div class="collection-card-title">{{ item.name }}</div>
                <div class="collection-card-meta">{{ item.countLabel }}</div>
              </a>
            </div>
          </div>
        </section>
      </section>

      <section
        v-if="model.genres.tv.length || model.genres.movie.length"
        class="discover-section-group discover-genre-section"
      >
        <div class="discover-genre-heading-row">
          <h2 class="discover-group-title">Genres</h2>
          <div class="discover-genre-tab-row" role="tablist" aria-label="Genre media type">
            <button
              type="button"
              class="discover-genre-tab"
              :class="{ active: model.activeGenreMedia === 'tv' }"
              data-discover-genre-media="tv"
              role="tab"
              :aria-selected="model.activeGenreMedia === 'tv' ? 'true' : 'false'"
              @click="setGenreMedia('tv')"
            >TV Shows</button>
            <button
              type="button"
              class="discover-genre-tab"
              :class="{ active: model.activeGenreMedia === 'movie' }"
              data-discover-genre-media="movie"
              role="tab"
              :aria-selected="model.activeGenreMedia === 'movie' ? 'true' : 'false'"
              @click="setGenreMedia('movie')"
            >Movies</button>
          </div>
        </div>

        <div class="discover-genre-panel" data-discover-genre-panel="tv" :hidden="model.activeGenreMedia !== 'tv'">
          <div class="discover-genre-grid">
            <a
              v-for="genre in model.genres.tv"
              :key="`tv:${genre.id}:${genre.name}`"
              class="discover-genre-card"
              :class="genre.toneClass"
              :href="genre.route"
            ><span>{{ genre.name }}</span></a>
            <div v-if="!model.genres.tv.length" class="v2-api-empty">No TV genres available.</div>
          </div>
        </div>

        <div class="discover-genre-panel" data-discover-genre-panel="movie" :hidden="model.activeGenreMedia !== 'movie'">
          <div class="discover-genre-grid">
            <a
              v-for="genre in model.genres.movie"
              :key="`movie:${genre.id}:${genre.name}`"
              class="discover-genre-card"
              :class="genre.toneClass"
              :href="genre.route"
            ><span>{{ genre.name }}</span></a>
            <div v-if="!model.genres.movie.length" class="v2-api-empty">No movie genres available.</div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
