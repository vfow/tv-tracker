<script setup lang="ts">
import type { UpcomingNotificationsViewModel } from './viewModel';

defineProps<{
  model: UpcomingNotificationsViewModel;
}>();
</script>

<template>
  <div
    style="display: contents"
    :data-tvtracker-upcoming-notifications-owner="`vue-${model.surface}`"
    v-html="model.html"
  ></div>
</template>
