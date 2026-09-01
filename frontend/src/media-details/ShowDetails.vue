<script setup lang="ts">
import DetailNode from './DetailNode.vue';
import type { ShowDetailsViewModel } from './showViewModel';

defineProps<{
  model: ShowDetailsViewModel;
}>();
</script>

<template>
  <div class="show-detail-page-inner" data-tvtracker-show-details-owner="vue">
    <div class="show-page-hero-shell">
      <button type="button" class="show-page-back-button" id="show-page-back-button" aria-label="Back">
        <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
      </button>

      <div
        class="modal-hero show-detail-hero show-page-hero"
        :style="{ backgroundImage: model.backdropStyle }"
      ></div>

      <div class="show-page-identity-row">
        <div class="show-page-hero-poster">
          <DetailNode v-for="(node, index) in model.poster" :key="`poster-${index}`" :node="node" />
        </div>
        <div class="show-page-hero-content">
          <div class="modal-title show-page-title">{{ model.title }}</div>
          <div class="modal-meta modal-meta-under-status show-page-meta-line">
            <DetailNode v-for="(node, index) in model.meta" :key="`meta-${index}`" :node="node" />
          </div>
          <DetailNode v-for="(node, index) in model.externalLinks" :key="`links-${index}`" :node="node" />
          <div class="show-page-actions-wrap">
            <DetailNode v-for="(node, index) in model.actions" :key="`actions-${index}`" :node="node" />
          </div>
        </div>
      </div>
    </div>

    <div class="modal-body show-page-body">
      <div class="modal-section show-detail-tabs-section">
        <DetailNode v-for="(node, index) in model.tabs" :key="`tabs-${index}`" :node="node" />
        <div class="show-detail-tab-panel">
          <DetailNode v-for="(node, index) in model.tabContent" :key="`content-${index}`" :node="node" />
        </div>
      </div>

      <DetailNode v-for="(node, index) in model.similar" :key="`similar-${index}`" :node="node" />
    </div>
  </div>
</template>
