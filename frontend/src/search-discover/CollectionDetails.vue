<script setup lang="ts">
import type { DiscoverListingItem } from './discoverViewModel';
import type { CollectionActions, CollectionEyeKey, CollectionFilterKey, CollectionViewModel } from './collectionViewModel';
import BrowseIcon from './BrowseIcon.vue';

const props = defineProps<{ model: CollectionViewModel; actions: CollectionActions }>();
const eyes: readonly { key: CollectionEyeKey; label: string }[] = [
  { key: 'fadeWatched', label: 'Fade watched' }, { key: 'hideWatched', label: 'Hide watched' },
  { key: 'hidePlan', label: 'Hide Plan to Watch' }, { key: 'hideFavorites', label: 'Hide Favorites' }
];
function setFilter(event: MouseEvent, key: CollectionFilterKey, value: string): void {
  const menu = (event.currentTarget as HTMLElement).closest('details');
  if (menu) menu.open = false;
  props.actions.setFilter(key, value);
}
function openMedia(event: MouseEvent, item: DiscoverListingItem): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  event.stopPropagation();
  void props.actions.openMedia(item, props.model.route);
}
</script>

<template>
  <div class="genre-detail-page-inner collection-detail-page-inner" data-tvtracker-collection-detail-owner="vue">
    <div class="genre-detail-header collection-detail-header">
      <button type="button" class="show-page-back-button genre-page-back-button" id="collection-detail-page-back-button" aria-label="Back" @click="actions.back">
        <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
      </button>
      <div><h1 class="genre-detail-title">{{ model.title }}</h1></div>
    </div>
    <div v-if="model.showFilters" class="browse-controls collection-detail-controls">
      <div class="browse-bar" aria-label="Collection movie filters">
        <span class="browse-bar-kicker">BROWSE BY</span>
        <details class="browse-menu browse-menu-year">
          <summary class="browse-bar-button">{{ model.yearLabel }} <BrowseIcon /></summary>
          <div class="browse-dropdown browse-dropdown-year">
            <div class="browse-year-decade-menu" data-collection-detail-year-menu>
              <div class="browse-option-list"><button type="button" class="browse-dropdown-option" :class="{selected: !model.filters.year && !model.filters.decade}" @click.stop="setFilter($event, 'year', '')"><span>Any</span><BrowseIcon v-if="!model.filters.year && !model.filters.decade" kind="check" /></button></div>
              <div class="browse-dropdown-divider"></div>
              <div class="browse-option-list browse-year-decade-list">
                <button v-for="option in model.decades" :key="option.value" type="button" class="browse-dropdown-option browse-decade-list-option" :class="{selected: option.selected}" :aria-pressed="option.selected" @click.stop="setFilter($event, 'decade', option.value)">
                  <span>{{ option.label }}</span><span class="browse-decade-list-icons"><BrowseIcon v-if="option.selected" kind="check" /><BrowseIcon kind="right" /></span>
                </button>
              </div>
            </div>
          </div>
        </details>
        <details v-for="menu in [{key:'genre', title:'GENRE', options:model.genres}, {key:'language', title:'LANGUAGE', options:model.languages}, {key:'sort', title:'SORT', options:model.sorts}] as const" :key="menu.key" class="browse-menu" :class="{'browse-menu-sort':menu.key === 'sort'}">
          <summary class="browse-bar-button">{{ menu.title }} <BrowseIcon /></summary>
          <div class="browse-dropdown" :class="{'browse-dropdown-sort':menu.key === 'sort'}">
            <div v-if="!menu.options.length" class="browse-dropdown-empty">{{ menu.key === 'genre' ? 'Genres are loading…' : 'Languages are loading…' }}</div>
            <div v-else class="browse-option-list" :class="{'browse-option-list-genre':menu.key === 'genre'}">
              <button v-for="option in menu.options" :key="option.value" type="button" class="browse-dropdown-option" :class="{selected: option.selected}" :aria-pressed="option.selected" @click.stop="setFilter($event, menu.key, option.value)"><span>{{ option.label }}</span><BrowseIcon v-if="option.selected" kind="check" /></button>
            </div>
          </div>
        </details>
        <details class="browse-menu eye-filter-menu collection-detail-eye-filter-menu">
          <summary class="browse-bar-button eye-filter-button" aria-label="Tracked filters"><img :src="eyes.some(eye => model.filters[eye.key]) ? '/static/assets/icons/eye-closed.png' : '/static/assets/icons/eye-open.png'" alt="" aria-hidden="true" class="eye-filter-icon"></summary>
          <div class="browse-dropdown eye-filter-dropdown"><div class="browse-option-list">
            <button v-for="eye in eyes" :key="eye.key" type="button" class="browse-dropdown-option eye-filter-option" :class="{selected:model.filters[eye.key]}" :aria-pressed="model.filters[eye.key]" @click.stop="actions.toggleEye(eye.key)"><span>{{ eye.label }}</span><BrowseIcon v-if="model.filters[eye.key]" kind="check" /></button>
          </div></div>
        </details>
      </div>
      <div v-if="model.visibleDecade" class="browse-year-secondary-bar" data-collection-detail-year-secondary-bar>
        <div class="browse-year-strip" :data-collection-detail-visible-decade="model.visibleDecade">
          <button type="button" class="browse-decade-nav browse-decade-nav-prev" aria-label="Previous decade" :disabled="model.visibleDecade <= 1870" @click.stop="setFilter($event, 'decade', String(model.visibleDecade - 10))"><BrowseIcon kind="left" /></button>
          <button type="button" class="browse-decade-current" aria-label="Current decade" @click.stop="setFilter($event, 'decade', String(model.visibleDecade))">{{ model.visibleDecade }}s</button>
          <div class="browse-year-strip-years"><button v-for="year in model.years" :key="year.value" type="button" class="browse-year-strip-year" :class="{selected:year.selected}" :aria-pressed="year.selected" @click.stop="setFilter($event, 'year', year.value)"><span>{{ year.label }}</span><BrowseIcon v-if="year.selected" kind="check" /></button></div>
          <button type="button" class="browse-decade-nav browse-decade-nav-next" aria-label="Next decade" :disabled="model.visibleDecade >= model.currentDecade" @click.stop="setFilter($event, 'decade', String(model.visibleDecade + 10))"><BrowseIcon kind="right" /></button>
        </div>
      </div>
      <div v-if="model.chips.length" class="browse-active-row collection-detail-active-row" aria-label="Active collection movie filters">
        <button v-for="chip in model.chips" :key="`${chip.key}:${chip.value}`" type="button" class="browse-active-chip" @click.stop="actions.removeFilter(chip.key, chip.value)">{{ chip.label }} <span aria-hidden="true">×</span></button>
        <button type="button" class="browse-clear-button" @click.stop="actions.clearFilters">CLEAR ALL</button>
      </div>
    </div>
    <div class="genre-result-content">
      <div v-if="model.bodyState === 'error'" class="empty-state genre-detail-empty"><h2>Collection could not load</h2><p>{{ model.error }}</p></div>
      <template v-else-if="model.bodyState === 'ready'">
        <div class="genre-result-summary">{{ model.countLabel }}</div>
        <div class="genre-tight-grid collection-movie-grid">
          <a v-for="item in model.items" :key="item.id" :href="item.route" class="genre-result-card collection-movie-card" :class="{'eye-filter-faded':item.faded}"
            :data-media-type="item.media" :data-media-id="item.id" :data-media-name="item.name" :data-show-name="item.name" :data-poster-path="item.posterPath" :data-overview="item.overview" :data-first-air-date="item.firstAirDate" @click="openMedia($event, item)">
            <div class="genre-result-poster"><img v-if="item.posterUrl" loading="lazy" decoding="async" :src="item.posterUrl" :alt="`${item.name} poster`"><div v-else class="genre-card-placeholder media-title-placeholder" :title="item.placeholderLabel"><span>{{ item.placeholderLabel }}</span></div></div>
            <div class="genre-result-title">{{ item.name }}</div>
            <div class="genre-result-meta">{{ item.year }}<template v-if="item.rating"> • {{ item.rating }}</template><template v-if="item.adult"> • <span class="adult-movie-badge">ADULT</span></template></div>
          </a>
        </div>
      </template>
      <div v-else-if="model.bodyState === 'loading'" class="genre-tight-grid genre-tight-grid-loading" role="status" aria-label="Loading collection movies"><div v-for="index in 12" :key="index" class="tt-skeleton-poster-card" aria-hidden="true"><div class="tt-skeleton-poster"></div><div class="tt-skeleton-line tt-skeleton-line-title"></div><div class="tt-skeleton-line tt-skeleton-line-meta"></div></div></div>
      <div v-else class="empty-state genre-detail-empty"><h2>No movies found</h2><p>{{ model.emptyMessage }}</p></div>
    </div>
  </div>
</template>
