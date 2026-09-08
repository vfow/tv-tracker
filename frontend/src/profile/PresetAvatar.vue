<script setup lang="ts">
defineProps<{ preset?: string }>();
</script>

<template>
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <rect width="100" height="100" fill="#080808" />
    <template v-if="preset === 'silhouette-2'">
      <circle cx="50" cy="35" r="19" fill="none" stroke="#e2e2e2" stroke-width="7" />
      <path d="M18 100c2-27 14-42 32-42s30 15 32 42" fill="none" stroke="#e2e2e2" stroke-width="8" />
    </template>
    <template v-else-if="preset === 'silhouette-3'">
      <rect x="31" y="16" width="38" height="38" rx="14" fill="#d8d8d8" />
      <path d="M18 100V82c0-15 12-27 27-27h10c15 0 27 12 27 27v18Z" fill="#9a9a9a" />
      <circle cx="43" cy="35" r="3" fill="#333" />
      <circle cx="57" cy="35" r="3" fill="#333" />
    </template>
    <template v-else-if="preset === 'silhouette-4'">
      <circle cx="50" cy="36" r="21" fill="#dcdcdc" />
      <path d="M14 100c4-29 18-43 36-43s32 14 36 43" fill="#dcdcdc" />
      <rect x="28" y="30" width="44" height="12" rx="6" fill="#3a3a3a" />
    </template>
    <template v-else>
      <circle cx="50" cy="35" r="20" fill="#e0e0e0" />
      <path d="M14 100c3-29 18-44 36-44s33 15 36 44" fill="#e0e0e0" />
    </template>
  </svg>
</template>
