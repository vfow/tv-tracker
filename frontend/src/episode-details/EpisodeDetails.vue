<script lang="ts">
const activeTabs = new Map<string, 'Cast' | 'Crew'>();
</script>
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { EpisodeDetailsActions, EpisodeDetailsModel, EpisodeTarget } from './contracts';
import EpisodePeople from './EpisodePeople.vue';
const props = defineProps<{model: EpisodeDetailsModel; actions: EpisodeDetailsActions}>();
const tab = ref<'Cast' | 'Crew'>(activeTabs.get(props.model.key) || 'Cast');
watch(() => props.model.key, key => { tab.value = activeTabs.get(key) || 'Cast'; });
function selectTab(value: 'Cast' | 'Crew'): void { tab.value = value; activeTabs.set(props.model.key, value); }
function tabKey(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 'Cast' : event.key === 'End' ? 'Crew' : tab.value === 'Cast' ? 'Crew' : 'Cast';
  selectTab(next);
  void nextTick(() => document.getElementById(`episode-tab-${next}`)?.focus());
}
function navigate(target: EpisodeTarget, event: MouseEvent): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  event.preventDefault();
  props.actions.navigate(props.model, target);
}
</script>
<template>
  <div data-tvtracker-episode-details-owner="vue" class="episode-detail-page-inner" :class="model.state === 'ready' ? 'episode-page-rebuild' : model.state === 'loading' ? 'tt-episode-skeleton-page' : ''">
    <template v-if="model.state === 'loading'">
      <div class="show-page-hero-shell episode-page-hero-shell" role="status" aria-label="Loading episode">
        <button id="episode-open-show-button" class="show-page-back-button episode-page-back-button" type="button" aria-label="Back" @click="actions.back"><img src="/static/assets/icons/arrow-narrow-left.svg" alt=""></button>
        <div class="show-page-hero episode-page-hero tt-episode-skeleton-still"></div>
        <div class="show-page-identity-row episode-page-identity-row tt-episode-skeleton-copy"><div class="show-page-hero-content episode-page-hero-content">
          <div class="tt-skeleton-kicker"></div><div class="tt-skeleton-heading"></div><div class="tt-skeleton-line tt-skeleton-line-wide"></div><div class="tt-skeleton-line tt-skeleton-line-mid"></div>
          <div class="tt-skeleton-action-row"><span></span><span></span><span></span></div><p>{{ model.code }}</p>
        </div></div>
      </div>
    </template>
    <template v-else-if="model.state === 'error'">
      <button id="episode-open-show-button" class="episode-detail-back-button" type="button" aria-label="Back to show" @click="actions.back"><img src="/static/assets/icons/arrow-narrow-left.svg" alt=""></button>
      <div class="empty-state episode-detail-loading-state" role="alert"><h2>Episode details failed to load</h2><p>Try again later.</p></div>
    </template>
    <template v-else>
      <div class="show-page-hero-shell episode-page-hero-shell">
        <button id="episode-open-show-button" class="show-page-back-button episode-page-back-button" type="button" aria-label="Back to show" @click="actions.back"><img src="/static/assets/icons/arrow-narrow-left.svg" alt=""></button>
        <div class="modal-hero show-detail-hero show-page-hero episode-page-hero" :style="{backgroundImage: model.backdrop}"></div>
        <div class="show-page-identity-row episode-page-identity-row"><div class="show-page-hero-content episode-page-hero-content">
          <div class="modal-title show-page-title episode-page-title">{{ model.title }}</div>
          <div class="modal-meta modal-meta-under-status show-page-meta-line episode-page-meta-line">
            <a class="show-detail-entity-link episode-page-show-link" :href="model.showRoute">{{ model.showTitle }}</a><span class="modal-meta-separator">•</span><span>{{ model.code }}</span><span class="modal-meta-separator">•</span><span>{{ model.airDate }}</span>
            <template v-if="model.runtime"><span class="modal-meta-separator">•</span><span>{{ model.runtime }}</span></template>
            <template v-if="model.rating"><span class="modal-meta-separator">•</span><span class="tmdb-rating-group"><span class="tmdb-rating-inline">{{ model.rating }}</span><span class="tmdb-rating-slash">/</span><span class="tmdb-rating-ten">10</span></span></template>
          </div>
        </div></div>
      </div>
      <div class="modal-body show-page-body episode-page-body">
        <div class="episode-page-primary-row">
          <section class="modal-section show-info-synopsis-section episode-page-info-section">
            <h3 class="modal-section-heading">Episode Info</h3><div class="modal-overview">{{ model.overview }}</div>
            <div v-if="model.links.length" class="v2-episode-links-line v2-show-action-line"><template v-for="(link, index) in model.links" :key="link.label"><span v-if="index" class="modal-meta-separator">•</span><a class="v2-clean-link v2-external-pill" :href="link.url" target="_blank" rel="noopener noreferrer">{{ link.label }}</a></template></div>
          </section>
          <section class="episode-page-actions-section" aria-label="Episode actions"><div class="show-page-actions-wrap episode-detail-actions episode-page-actions"><div class="modal-status-buttons show-page-status-buttons episode-page-action-buttons">
            <!-- The existing EpisodeTrackingController exclusively owns watched actions. -->
            <button v-if="model.canToggle" id="episode-toggle-watched-button" class="modal-status-button episode-page-action-button" :class="{active: model.watched}" type="button">{{ model.watched ? 'MARK UNWATCHED' : 'MARK WATCHED' }}</button>
            <a v-if="model.previous" id="episode-prev-button" class="modal-status-button episode-page-action-button episode-page-nav-button" :href="model.previous.route" @click="navigate(model.previous, $event)">PREVIOUS EPISODE</a>
            <a v-if="model.next" id="episode-next-button" class="modal-status-button episode-page-action-button episode-page-nav-button" :href="model.next.route" @click="navigate(model.next, $event)">NEXT EPISODE</a>
          </div></div></section>
        </div>
        <section class="modal-section episode-page-status-section"><div class="episode-page-status-grid">
          <div class="show-progress-card episode-page-status-card" :class="{watched: model.watched}"><div class="episode-detail-label">Status</div><div class="episode-detail-value">{{ model.status }}</div></div>
          <div class="show-progress-card episode-page-status-card"><div class="episode-detail-label">Watched</div><div class="episode-detail-value">{{ model.watchedText }}</div></div>
        </div></section>
        <div class="modal-section show-detail-tabs-section episode-detail-tabs-section">
          <div class="show-detail-tabs episode-detail-tabs" role="tablist" aria-label="Episode cast and crew">
            <button v-for="name in (['Cast', 'Crew'] as const)" :id="`episode-tab-${name}`" :key="name" class="show-detail-tab" :class="{active: tab === name}" type="button" role="tab" :aria-selected="tab === name" :tabindex="tab === name ? 0 : -1" @keydown="tabKey" :aria-controls="`episode-panel-${name}`" @click="selectTab(name)">{{ name }}</button>
          </div>
          <div class="show-detail-tab-panel">
            <div id="episode-panel-Cast" role="tabpanel" aria-labelledby="episode-tab-Cast" :hidden="tab !== 'Cast'">
              <div v-if="model.guests.length" class="modal-section v2-clean-section v2-actor-list-section v2-episode-guest-stars-section v2-cast-layout-vertical"><h3 class="modal-section-heading">Guest Stars</h3><div class="v2-actor-list"><EpisodePeople :people="model.guests" /></div></div>
              <div v-if="model.cast.length" class="modal-section v2-clean-section v2-actor-list-section v2-episode-cast-section v2-cast-layout-vertical"><h3 class="modal-section-heading">Cast</h3><div class="v2-actor-list"><EpisodePeople :people="model.cast" /></div></div>
            </div>
            <div id="episode-panel-Crew" role="tabpanel" aria-labelledby="episode-tab-Crew" :hidden="tab !== 'Crew'">
              <section v-if="model.crew.length" class="episode-page-crew-section"><div class="movie-crew-department-list crew-job-group-list">
                <div v-for="group in model.crew" :key="group.label" class="show-detail-crew-group movie-crew-department-group crew-job-group"><h3 class="modal-section-heading movie-crew-department-heading crew-job-heading">{{ group.label }}</h3><div class="v2-actor-list movie-crew-list"><EpisodePeople :people="group.people" /></div></div>
              </div></section>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
