<script setup lang="ts">
import type { ShowDetailsViewModel } from './showViewModel';

defineProps<{
  model: ShowDetailsViewModel;
}>();
</script>

<template>
  <div style="display: contents" data-tvtracker-show-details-owner="vue" v-html="model.html"></div>
</template>
