<script setup lang="ts">
import type { MovieDetailsViewModel } from './movieViewModel';

defineProps<{
  model: MovieDetailsViewModel;
}>();
</script>

<template>
  <div data-tvtracker-movie-details-owner="vue" v-html="model.html"></div>
</template>
