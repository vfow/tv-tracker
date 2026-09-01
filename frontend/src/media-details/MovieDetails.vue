<script setup lang="ts">
import DetailNode from './DetailNode.vue';
import type { MovieDetailsViewModel } from './movieViewModel';

defineProps<{
  model: MovieDetailsViewModel;
}>();
</script>

<template>
  <div
    v-if="model.state !== 'ready'"
    class="show-detail-page-inner"
    data-tvtracker-movie-details-owner="vue"
  >
    <button type="button" class="show-page-back-button" id="movie-page-back-button" aria-label="Back">
      <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
    </button>
    <div class="empty-state show-detail-loading-state">
      <h2>{{ model.state === 'loading' ? 'Loading movie' : 'Movie could not load' }}</h2>
      <p>{{ model.message }}</p>
    </div>
  </div>

  <div
    v-else
    class="show-detail-page-inner movie-detail-page-inner"
    data-tvtracker-movie-details-owner="vue"
  >
    <div class="show-page-hero-shell movie-page-hero-shell">
      <button type="button" class="show-page-back-button" id="movie-page-back-button" aria-label="Back">
        <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
      </button>

      <div
        class="modal-hero show-detail-hero show-page-hero movie-page-hero"
        :style="{ backgroundImage: model.backdropStyle }"
      ></div>

      <div class="show-page-identity-row movie-page-identity-row">
        <div class="show-page-hero-poster movie-page-hero-poster">
          <DetailNode v-for="(node, index) in model.poster" :key="`poster-${index}`" :node="node" />
        </div>
        <div class="show-page-hero-content movie-page-hero-content">
          <div class="modal-title show-page-title">{{ model.title }}</div>
          <div class="modal-meta modal-meta-under-status show-page-meta-line">
            <DetailNode v-for="(node, index) in model.meta" :key="`meta-${index}`" :node="node" />
          </div>
          <DetailNode v-for="(node, index) in model.externalLinks" :key="`links-${index}`" :node="node" />
          <div class="show-page-actions-wrap movie-page-actions-wrap">
            <DetailNode v-for="(node, index) in model.actions" :key="`actions-${index}`" :node="node" />
          </div>
        </div>
      </div>
    </div>

    <div class="modal-body show-page-body movie-page-body">
      <div class="modal-section show-detail-tabs-section movie-detail-tabs-section">
        <DetailNode v-for="(node, index) in model.tabs" :key="`tabs-${index}`" :node="node" />
        <div class="movie-detail-tab-content show-detail-tab-panel">
          <DetailNode v-for="(node, index) in model.tabContent" :key="`content-${index}`" :node="node" />
        </div>
      </div>
    </div>
  </div>
</template>
