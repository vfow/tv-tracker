<script setup lang="ts">
import type { EpisodePerson } from './contracts';
defineProps<{people: readonly EpisodePerson[]}>();
</script>
<template>
  <component v-for="(person, index) in people" :is="person.route ? 'a' : 'div'" :key="`${person.id}-${index}`" class="v2-actor-list-row" :class="{'v2-person-card-link': person.route}" :href="person.route || undefined" :data-person-role="person.routeRole" data-person-media="tv" :data-person-id="person.id" :data-person-name="person.name">
    <div class="v2-actor-list-photo">
      <img v-if="person.photo" loading="lazy" decoding="async" :src="person.photo" alt="">
      <div v-else class="v2-actor-placeholder person-silhouette-placeholder" aria-hidden="true">
        <svg viewBox="0 0 64 64" focusable="false" role="img">
          <path class="person-silhouette-head" d="M32 30c7.18 0 13-5.82 13-13S39.18 4 32 4 19 9.82 19 17s5.82 13 13 13Z" />
          <path class="person-silhouette-body" d="M10 60c1.8-13.05 10.4-22 22-22s20.2 8.95 22 22H10Z" />
        </svg>
      </div>
    </div>
    <div class="v2-actor-list-text"><div class="v2-actor-name">{{ person.name }}</div><div class="v2-actor-role">{{ person.role }}</div></div>
  </component>
</template>
