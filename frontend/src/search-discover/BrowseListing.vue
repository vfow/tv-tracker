<script setup lang="ts">
import type { BrowseActions, BrowseListingModel } from './browseViewModel';
import type { DiscoverListingItem } from './discoverViewModel';
import BrowseControls from './BrowseControls.vue';
const props=defineProps<{model: BrowseListingModel; actions: BrowseActions}>();
function open(event: MouseEvent, item: DiscoverListingItem) {
  if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
  event.preventDefault();event.stopPropagation();void props.actions.openMedia(item);
}
</script>
<template>
  <div class="genre-detail-page-inner" :class="{'browse-detail-page-inner':model.kind==='browse','discovery-filter-page-inner':model.kind==='discovery'}" data-tvtracker-browse-listing-owner="vue">
    <div class="genre-detail-header"><button type="button" class="show-page-back-button genre-page-back-button" aria-label="Back" @click="actions.back"><img src="/static/assets/icons/arrow-narrow-left.svg" alt=""></button><div><h1 class="genre-detail-title">{{ model.title }}</h1><div v-if="model.showMedia" class="genre-media-switch browse-media-switch" role="tablist" aria-label="Media type"><button v-for="media in (['tv','movie'] as const)" :key="media" type="button" class="genre-media-switch-button" :class="{active:model.media===media}" role="tab" :aria-selected="model.media===media" @click.stop="actions.setMedia(media)">{{ media==='tv' ? 'TV Shows' : 'Movies' }}</button></div></div></div>
    <BrowseControls v-if="model.controls" :key="model.media" :model="model.controls" :actions="actions" />
    <div class="genre-result-content">
      <div v-if="model.bodyState==='error'" class="empty-state genre-detail-empty"><h2>{{ model.errorTitle }}</h2><p>{{ model.error }}</p></div>
      <template v-else-if="model.bodyState==='ready'"><div class="genre-tight-grid"><a v-for="item in model.items" :key="`${item.media}:${item.id}`" :href="item.route" class="genre-result-card" :class="{'eye-filter-faded':item.faded,'browse-result-card':model.kind==='browse','discovery-filter-result-card':model.kind==='discovery'}" :data-media-id="item.id" :data-media-type="item.media" @click="open($event,item)"><div class="genre-result-poster"><img v-if="item.posterUrl" loading="lazy" decoding="async" :src="item.posterUrl" :alt="`${item.name} poster`"><div v-else class="genre-card-placeholder media-title-placeholder" :title="item.placeholderLabel"><span>{{ item.placeholderLabel }}</span></div></div><div class="genre-result-title">{{ item.name }}</div><div class="genre-result-meta">{{ item.year }}<template v-if="item.rating"> • {{ item.rating }}</template><template v-if="item.adult"> • <span class="adult-movie-badge">ADULT</span></template></div></a></div><button v-if="model.hasMore" type="button" class="view-more-button genre-load-more-button" @click="actions.viewMore">VIEW MORE</button><div v-if="model.loadingMore" class="v2-api-empty genre-loading-note" role="status">Loading more {{ model.media==='movie' ? 'movies' : 'shows' }}…</div></template>
      <div v-else-if="model.bodyState==='loading'" class="genre-tight-grid genre-tight-grid-loading" role="status" aria-label="Loading browse results"><div v-for="index in 12" :key="index" class="tt-skeleton-poster-card" aria-hidden="true"><div class="tt-skeleton-poster"></div><div class="tt-skeleton-line tt-skeleton-line-title"></div><div class="tt-skeleton-line tt-skeleton-line-meta"></div></div></div>
      <div v-else class="empty-state genre-detail-empty"><h2>{{ model.emptyTitle }}</h2><p>{{ model.emptyMessage }}</p></div>
    </div>
  </div>
</template>
