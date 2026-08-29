<script setup lang="ts">
import { computed } from 'vue';

import type { SearchEyeState, SearchMediaType } from './contracts';
import type {
  SearchCollectionItem,
  SearchPersonItem,
  SearchPosterItem,
  SearchRendererActions,
  SearchViewModel
} from './searchViewModel';

const props = defineProps<{
  model: SearchViewModel;
  actions: SearchRendererActions;
}>();

const tabs: readonly Readonly<{ type: SearchMediaType; label: string }>[] = Object.freeze([
  Object.freeze({ type: 'tv', label: 'TV Shows' }),
  Object.freeze({ type: 'movie', label: 'Movies' }),
  Object.freeze({ type: 'person', label: 'People' }),
  Object.freeze({ type: 'collection', label: 'Collections' })
]);

const eyeOptions: readonly Readonly<{ key: keyof SearchEyeState; label: string }>[] = Object.freeze([
  Object.freeze({ key: 'fadeWatched', label: 'Fade watched' }),
  Object.freeze({ key: 'hideWatched', label: 'Hide watched' }),
  Object.freeze({ key: 'hidePlan', label: 'Hide Plan to Watch' }),
  Object.freeze({ key: 'hideFavorites', label: 'Hide Favorites' })
]);

const isTrackableMedia = computed(() => props.model.media === 'tv' || props.model.media === 'movie');
const eyeActive = computed(() => Object.values(props.model.eyeState).some(Boolean));
const eyeIcon = computed(() => eyeActive.value ? '/static/assets/icons/eye-closed.png' : '/static/assets/icons/eye-open.png');
const mediaItems = computed(() => props.model.items.filter((item): item is SearchPosterItem => item.kind === 'media'));
const personItems = computed(() => props.model.items.filter((item): item is SearchPersonItem => item.kind === 'person'));
const collectionItems = computed(() => props.model.items.filter((item): item is SearchCollectionItem => item.kind === 'collection'));

function isPlainAppClick(event: MouseEvent): boolean {
  return !event.defaultPrevented
    && event.button === 0
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey;
}

function handleMediaClick(event: MouseEvent, item: SearchPosterItem): void {
  if (!isPlainAppClick(event)) return;
  event.preventDefault();
  void props.actions.openMedia(item);
}

function handlePersonClick(event: MouseEvent, item: SearchPersonItem): void {
  if (!isPlainAppClick(event)) return;
  event.preventDefault();
  void props.actions.openPerson(item);
}

function handleCollectionClick(event: MouseEvent, item: SearchCollectionItem): void {
  if (!isPlainAppClick(event)) return;
  event.preventDefault();
  void props.actions.openCollection(item);
}
</script>

<template>
  <div class="search-page-shell" :class="{ 'discover-live-search-shell': model.liveDiscover }" data-tvtracker-search-owner="vue">
    <div class="search-tab-row" role="tablist" aria-label="Search result type">
      <button
        v-for="tab in tabs"
        :key="tab.type"
        type="button"
        class="search-tab-button"
        :class="{ active: model.media === tab.type }"
        :data-search-media="tab.type"
        role="tab"
        :aria-selected="model.media === tab.type ? 'true' : 'false'"
        @click="actions.setMedia(tab.type)"
      >
        {{ tab.label }}
      </button>

      <details
        v-if="model.query && isTrackableMedia"
        class="browse-menu eye-filter-menu search-eye-filter-menu"
        :open="model.eyeMenuOpen"
      >
        <summary class="browse-bar-button eye-filter-button" aria-label="Tracked filters" data-eye-filter-summary>
          <img :src="eyeIcon" alt="" aria-hidden="true" class="eye-filter-icon">
        </summary>
        <div class="browse-dropdown eye-filter-dropdown">
          <div class="browse-option-list">
            <button
              v-for="option in eyeOptions"
              :key="option.key"
              type="button"
              class="browse-dropdown-option eye-filter-option"
              :class="{ selected: model.eyeState[option.key] }"
              :data-eye-toggle="option.key"
            >
              <span>{{ option.label }}</span>
              <svg
                v-if="model.eyeState[option.key]"
                class="browse-selected-check"
                viewBox="0 0 12 10"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M1 5.2 4.2 8.3 11 1.3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </details>

      <div
        v-else-if="model.query"
        class="browse-menu eye-filter-menu eye-filter-menu-inactive search-eye-filter-menu"
        aria-hidden="true"
      >
        <span class="browse-bar-button eye-filter-button" aria-label="Tracked filters inactive">
          <img src="/static/assets/icons/eye-open.png" alt="" aria-hidden="true" class="eye-filter-icon">
        </span>
      </div>
    </div>

    <div class="search-results-body">
      <div v-if="model.bodyState === 'prompt'" class="empty-state search-empty-state">
        <p>Start typing to search.</p>
      </div>

      <div
        v-else-if="model.bodyState === 'loading' && model.media === 'person'"
        class="search-person-grid search-person-grid-loading"
      >
        <div v-for="index in 12" :key="index" class="search-person-card search-person-skeleton-card" aria-hidden="true">
          <div class="tt-skeleton-poster"></div>
          <div class="tt-skeleton-line tt-skeleton-line-title"></div>
        </div>
      </div>

      <div
        v-else-if="model.bodyState === 'loading' && model.media === 'collection'"
        class="collection-grid collection-search-grid collection-grid-loading"
      >
        <div v-for="index in 12" :key="index" class="collection-card collection-skeleton-card" aria-hidden="true">
          <div class="collection-poster-stack">
            <div class="collection-stack-poster collection-stack-poster-1"></div>
            <div class="collection-stack-poster collection-stack-poster-2"></div>
            <div class="collection-stack-poster collection-stack-poster-3"></div>
          </div>
          <div class="tt-skeleton-line tt-skeleton-line-title"></div>
          <div class="tt-skeleton-line tt-skeleton-line-meta"></div>
        </div>
      </div>

      <div
        v-else-if="model.bodyState === 'loading'"
        class="genre-tight-grid genre-tight-grid-loading search-tight-grid"
      >
        <div v-for="index in 12" :key="index" class="tt-skeleton-poster-card" aria-hidden="true">
          <div class="tt-skeleton-poster"></div>
          <div class="tt-skeleton-line tt-skeleton-line-title"></div>
          <div class="tt-skeleton-line tt-skeleton-line-meta"></div>
        </div>
      </div>

      <div v-else-if="model.bodyState === 'results' && model.media === 'person'" class="search-person-grid">
        <a
          v-for="item in personItems"
          :key="`person:${item.id}`"
          :href="item.route"
          class="search-person-card"
          data-media-type="person"
          :data-media-id="item.id"
          :data-media-name="item.name"
          data-person-role="person"
          @click="handlePersonClick($event, item)"
        >
          <div class="search-person-photo">
            <img v-if="item.photoUrl" loading="lazy" decoding="async" :src="item.photoUrl" :alt="`${item.name} photo`">
            <div v-else class="search-person-placeholder person-silhouette-placeholder" aria-hidden="true">
              <svg viewBox="0 0 64 64" focusable="false" role="img">
                <path class="person-silhouette-head" d="M32 30c7.18 0 13-5.82 13-13S39.18 4 32 4 19 9.82 19 17s5.82 13 13 13Z" />
                <path class="person-silhouette-body" d="M10 60c1.8-13.05 10.4-22 22-22s20.2 8.95 22 22H10Z" />
              </svg>
            </div>
          </div>
          <div class="search-person-name">{{ item.name }}</div>
        </a>
      </div>

      <div v-else-if="model.bodyState === 'results' && model.media === 'collection'" class="collection-grid collection-search-grid">
        <a
          v-for="item in collectionItems"
          :key="`collection:${item.id}`"
          :href="item.route"
          class="collection-card collection-search-card"
          :data-collection-id="item.id"
          :data-collection-name="item.name"
          @click="handleCollectionClick($event, item)"
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

      <div v-else-if="model.bodyState === 'results'" class="genre-tight-grid search-tight-grid">
        <a
          v-for="item in mediaItems"
          :key="`${item.media}:${item.id}`"
          :href="item.route"
          class="genre-result-card search-result-poster-card"
          :data-eye-faded="item.eyeFaded ? 'true' : 'false'"
          :data-media-type="item.media"
          :data-media-id="item.id"
          :data-media-name="item.name"
          :data-poster-path="item.posterPath"
          :data-overview="item.overview"
          :data-first-air-date="item.firstAirDate"
          :data-release-date="item.releaseDate"
          @click="handleMediaClick($event, item)"
        >
          <div class="genre-result-poster">
            <img v-if="item.posterUrl" loading="lazy" decoding="async" :src="item.posterUrl" :alt="`${item.name} poster`">
            <div v-else class="genre-card-placeholder media-title-placeholder" :title="item.placeholderLabel">
              <span>{{ item.placeholderLabel }}</span>
            </div>
          </div>
          <div class="genre-result-title">{{ item.name }}</div>
          <div class="genre-result-meta">
            {{ item.year }}{{ item.ratingLabel }}<template v-if="item.adult"> • <span class="adult-movie-badge">ADULT</span></template>
          </div>
        </a>
      </div>

      <div v-else class="empty-state search-empty-state">
        <h2>{{ model.emptyHeading }}</h2>
        <p>Try another tab or another search.</p>
      </div>
    </div>

    <button
      v-if="model.canLoadMore"
      id="search-load-more-button"
      type="button"
      class="view-more-button search-view-more-button"
      :disabled="model.loading"
      @click="actions.loadMore()"
    >
      {{ model.loading ? 'Loading…' : 'VIEW MORE' }}
    </button>
  </div>
</template>
