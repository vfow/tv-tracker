<script setup lang="ts">
import { ref } from 'vue';
import type { PersonActions, PersonViewModel } from './personViewModel';
import type { DiscoverListingItem } from './discoverViewModel';
import type { CollectionEyeKey } from './collectionViewModel';
import type { DiscoverMediaType } from './contracts';
import BrowseIcon from './BrowseIcon.vue';

const props = defineProps<{ model: PersonViewModel; actions: PersonActions }>();
const expandedBio = ref(false);
const eyes: readonly {key: CollectionEyeKey; label: string}[] = [
  {key:'fadeWatched',label:'Fade watched'},{key:'hideWatched',label:'Hide watched'},
  {key:'hidePlan',label:'Hide Plan to Watch'},{key:'hideFavorites',label:'Hide Favorites'}
];
function plainClick(event: MouseEvent): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
function mediaClick(event: MouseEvent, media: DiscoverMediaType): void {
  if (!plainClick(event)) return;
  event.preventDefault(); event.stopPropagation(); void props.actions.setMedia(media);
}
function cardClick(event: MouseEvent, item: DiscoverListingItem): void {
  if (!plainClick(event)) return;
  event.preventDefault(); event.stopPropagation(); void props.actions.openMedia(item);
}
function roleClick(event: MouseEvent, role: string): void {
  const menu = (event.currentTarget as HTMLElement).closest('details');
  if (menu) menu.open = false;
  void props.actions.setRole(role);
}
</script>

<template>
  <div class="genre-detail-page-inner person-detail-page-inner" data-tvtracker-person-owner="vue">
    <div class="person-detail-layout">
      <main class="person-detail-main">
        <div class="genre-detail-header person-detail-header"><div class="person-detail-title-area">
          <button type="button" class="show-page-back-button genre-page-back-button" id="person-page-back-button" aria-label="Back" @click="actions.back"><img src="/static/assets/icons/arrow-narrow-left.svg" alt=""></button>
          <div><h1 class="genre-detail-title person-detail-title">{{ model.name }}</h1></div>
        </div></div>
        <div class="genre-filter-bar person-filter-bar" aria-label="Person filters">
          <div class="genre-media-switch person-media-switch" role="tablist" aria-label="Person media type">
            <a :href="model.tvRoute" class="genre-media-switch-button" :class="{active:model.media === 'tv'}" data-person-media="tv" role="tab" :aria-selected="model.media === 'tv'" @click="mediaClick($event,'tv')">TV Shows</a>
            <a :href="model.movieRoute" class="genre-media-switch-button" :class="{active:model.media === 'movie'}" data-person-media="movie" role="tab" :aria-selected="model.media === 'movie'" @click="mediaClick($event,'movie')">Movies</a>
          </div>
          <div class="browse-bar person-role-browse-bar">
            <details class="browse-menu person-role-menu"><summary class="browse-bar-button person-role-button">ROLE <BrowseIcon /></summary>
              <div class="browse-dropdown person-role-dropdown"><div class="browse-option-list"><button v-for="role in model.roles" :key="role.value" type="button" class="browse-dropdown-option" :class="{selected:role.selected}" :aria-pressed="role.selected" :data-person-role-filter="role.value" @click.stop="roleClick($event,role.value)"><span>{{ role.label }}</span><BrowseIcon v-if="role.selected" kind="check" /></button></div></div>
            </details>
            <details class="browse-menu eye-filter-menu person-eye-filter-menu"><summary class="browse-bar-button eye-filter-button" aria-label="Tracked filters"><img :src="eyes.some(eye=>model.eyes[eye.key]) ? '/static/assets/icons/eye-closed.png' : '/static/assets/icons/eye-open.png'" alt="" aria-hidden="true" class="eye-filter-icon"></summary>
              <div class="browse-dropdown eye-filter-dropdown"><div class="browse-option-list"><button v-for="eye in eyes" :key="eye.key" type="button" class="browse-dropdown-option eye-filter-option" :class="{selected:model.eyes[eye.key]}" :aria-pressed="model.eyes[eye.key]" @click.stop="actions.toggleEye(eye.key)"><span>{{ eye.label }}</span><BrowseIcon v-if="model.eyes[eye.key]" kind="check" /></button></div></div>
            </details>
          </div>
        </div>
        <div class="genre-result-content person-result-content">
          <div v-if="model.bodyState === 'error'" class="empty-state genre-detail-empty"><h2>Person could not load</h2><p>{{ model.error }}</p></div>
          <div v-else-if="model.bodyState === 'ready'" class="genre-tight-grid person-tight-grid">
            <a v-for="item in model.items" :key="`${item.media}:${item.id}`" :href="item.route" class="genre-result-card person-result-card" :data-eye-faded="item.faded ? 'true' : 'false'" :data-media-type="item.media" :data-media-id="item.id" :data-media-name="item.name" :data-poster-path="item.posterPath" :data-overview="item.overview" :data-first-air-date="item.firstAirDate" @click="cardClick($event,item)">
              <div class="genre-result-poster"><img v-if="item.posterUrl" loading="lazy" decoding="async" :src="item.posterUrl" :alt="`${item.name} poster`"><div v-else class="genre-card-placeholder media-title-placeholder" :title="item.placeholderLabel"><span>{{ item.placeholderLabel }}</span></div></div>
              <div class="genre-result-title">{{ item.name }}</div><div class="genre-result-meta">{{ item.year }}<template v-if="item.rating"> • {{ item.rating }}</template><template v-if="item.adult"> • <span class="adult-movie-badge">ADULT</span></template></div>
              <div v-if="item.roleLabel" class="person-result-role">{{ item.roleLabel }}</div>
            </a>
          </div>
          <div v-else-if="model.bodyState === 'loading'" class="genre-tight-grid genre-tight-grid-loading person-tight-grid" role="status" aria-label="Loading person credits"><div v-for="index in 12" :key="index" class="tt-skeleton-poster-card" aria-hidden="true"><div class="tt-skeleton-poster"></div><div class="tt-skeleton-line tt-skeleton-line-title"></div><div class="tt-skeleton-line tt-skeleton-line-meta"></div></div></div>
          <div v-else class="empty-state genre-detail-empty"><h2>{{ model.emptyTitle }}</h2><p>{{ model.emptyMessage }}</p></div>
        </div>
      </main>
      <aside v-if="model.profile" class="person-profile-panel" aria-label="Person details">
        <div class="person-profile-photo"><img v-if="model.profile.photoUrl" loading="lazy" decoding="async" :src="model.profile.photoUrl" :alt="`${model.name} photo`"><div v-else class="person-profile-placeholder person-silhouette-placeholder" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false" role="img"><path class="person-silhouette-head" d="M32 30c7.18 0 13-5.82 13-13S39.18 4 32 4 19 9.82 19 17s5.82 13 13 13Z" /><path class="person-silhouette-body" d="M10 60c1.8-13.05 10.4-22 22-22s20.2 8.95 22 22H10Z" /></svg></div></div>
        <div class="person-profile-bio-wrap" :class="{'is-collapsed':model.profile.longBio && !expandedBio,'is-expanded':expandedBio}"><p class="person-profile-bio-text">{{ model.profile.biography }}</p><button v-if="model.profile.longBio && !expandedBio" type="button" class="person-bio-more-button" @click="expandedBio=true">more</button></div>
        <div class="person-progress-card" aria-label="Watched progress"><div class="person-progress-content"><div class="person-progress-copy"><span>You've watched</span><strong>{{ model.profile.watched }} of {{ model.profile.total }}</strong></div><div class="person-progress-percent" :aria-label="`${model.profile.percent} percent watched`"><strong>{{ model.profile.percent }}</strong><span>%</span></div></div><div class="person-progress-track" aria-hidden="true"><div class="person-progress-fill" :style="{width:`${model.profile.percent}%`}"></div></div></div>
      </aside>
    </div>
  </div>
</template>
