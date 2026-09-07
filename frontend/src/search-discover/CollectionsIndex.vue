<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import type { CollectionsIndexActions, CollectionsIndexViewModel } from './collectionViewModel';
import BrowseIcon from './BrowseIcon.vue';

const props = defineProps<{ model: CollectionsIndexViewModel; actions: CollectionsIndexActions }>();
const draft = ref(props.model.searchDraft);
let timer: ReturnType<typeof setTimeout> | undefined;
function cancelTimer(): void { if (timer !== undefined) clearTimeout(timer); timer = undefined; }
watch(() => props.model.searchDraft, value => {
  if (value !== draft.value) { cancelTimer(); draft.value = value; }
});
onBeforeUnmount(cancelTimer);
function searchInput(event: Event): void {
  draft.value = (event.target as HTMLInputElement).value;
  props.actions.searchDraft(draft.value);
  cancelTimer();
  timer = setTimeout(() => { timer = undefined; props.actions.search(draft.value); }, 360);
}
function submitSearch(): void { cancelTimer(); props.actions.search(draft.value); }
function filter(event: MouseEvent, key: 'genre' | 'decade' | 'sort', value: string): void {
  const menu = (event.currentTarget as HTMLElement).closest('details');
  if (menu) menu.open = false;
  props.actions.setFilter(key, value);
}
</script>

<template>
  <div class="genre-detail-page-inner collections-page-inner" data-tvtracker-collections-index-owner="vue">
    <div class="genre-detail-header collections-page-header">
      <button type="button" class="show-page-back-button genre-page-back-button" id="collections-page-back-button" aria-label="Back" @click="actions.back"><img src="/static/assets/icons/arrow-narrow-left.svg" alt=""></button>
      <div><h1 class="genre-detail-title">Collections</h1></div>
    </div>
    <div class="browse-controls collections-controls">
      <div class="browse-bar collections-browse-bar" aria-label="Collection filters">
        <div class="collections-search-box"><input type="search" class="library-search-input collections-search-input" data-collection-search :value="draft" placeholder="Search collections" aria-label="Search collections" autocomplete="off" @input="searchInput" @keydown.enter.prevent="submitSearch"></div>
        <span class="browse-bar-kicker">BROWSE BY</span>
        <details v-for="menu in [{key:'decade',title:'DECADE',options:model.decades},{key:'genre',title:'GENRE',options:model.genres},{key:'sort',title:'SORT',options:model.sorts}] as const" :key="menu.key" class="browse-menu" :class="{'browse-menu-sort':menu.key === 'sort'}">
          <summary class="browse-bar-button">{{ menu.title }} <BrowseIcon /></summary>
          <div class="browse-dropdown" :class="{'browse-dropdown-sort':menu.key === 'sort'}">
            <div v-if="!menu.options.length" class="browse-dropdown-empty">{{ menu.key === 'genre' ? 'Genres are loading…' : 'Decades are loading…' }}</div>
            <div v-else class="browse-option-list" :class="{'browse-option-list-genre':menu.key === 'genre'}"><button v-for="option in menu.options" :key="option.value" type="button" class="browse-dropdown-option" :class="{selected:option.selected}" :aria-pressed="option.selected" @click.stop="filter($event,menu.key,option.value)"><span>{{ option.label }}</span><BrowseIcon v-if="option.selected" kind="check" /></button></div>
          </div>
        </details>
      </div>
      <div v-if="model.chips.length" class="browse-active-row collections-active-row" aria-label="Active collection filters">
        <button v-for="chip in model.chips" :key="chip.key" type="button" class="browse-active-chip" @click.stop="actions.clearFilter(chip.key)">{{ chip.label }}<span aria-hidden="true">×</span></button>
        <button type="button" class="browse-clear-button" @click.stop="actions.clearFilter('all')">CLEAR ALL</button>
      </div>
    </div>
    <div class="genre-result-content">
      <div v-if="model.bodyState === 'error'" class="empty-state genre-detail-empty"><h2>Collections could not load</h2><p>{{ model.error }}</p></div>
      <template v-else-if="model.bodyState === 'ready'">
        <div class="collection-grid">
          <a v-for="item in model.items" :key="item.id" :href="item.route" class="collection-card collection-index-card" :data-collection-id="item.id" :data-collection-name="item.name">
            <div v-if="item.posterSlots.length" class="collection-poster-stack" :class="`collection-poster-count-${item.posterSlots.length}`" aria-hidden="true">
              <div v-for="(slot,index) in item.posterSlots" :key="`${item.id}:${index}:${slot.label}`" class="collection-stack-poster" :class="[`collection-stack-poster-${index+1}`,{'collection-stack-placeholder':!slot.imageUrl}]" :title="slot.label"><img v-if="slot.imageUrl" loading="lazy" decoding="async" :src="slot.imageUrl" :alt="`${item.name} poster`"></div>
            </div>
            <div class="collection-card-title">{{ item.name }}</div><div class="collection-card-meta">{{ item.countLabel }}</div>
          </a>
        </div>
        <div v-if="model.hasMore" class="collections-view-more-row"><button type="button" class="view-more-button collections-view-more-button" data-collection-view-more @click="actions.viewMore">VIEW MORE</button></div>
      </template>
      <div v-else-if="model.bodyState === 'loading'" class="collection-grid collection-grid-loading" role="status" aria-label="Loading collections">
        <div v-for="index in 12" :key="index" class="collection-card collection-skeleton-card" aria-hidden="true"><div class="collection-poster-stack"><div v-for="slot in 3" :key="slot" class="collection-stack-poster" :class="`collection-stack-poster-${slot}`"></div></div><div class="tt-skeleton-line tt-skeleton-line-title"></div><div class="tt-skeleton-line tt-skeleton-line-meta"></div></div>
      </div>
      <div v-else class="empty-state genre-detail-empty"><h2>{{ model.emptyTitle }}</h2><p>{{ model.emptyMessage }}</p></div>
    </div>
  </div>
</template>
