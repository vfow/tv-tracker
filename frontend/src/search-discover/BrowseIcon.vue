<script setup lang="ts">
withDefaults(defineProps<{ kind?: 'down' | 'left' | 'right' | 'check' }>(), { kind: 'down' });
</script>
<template>
  <svg :class="kind === 'check' ? 'browse-selected-check' : kind === 'down' ? 'browse-chevron browse-chevron-down' : `browse-decade-nav-icon browse-decade-nav-icon-${kind}`"
    :viewBox="kind === 'check' ? '0 0 12 10' : kind === 'down' ? '0 0 12 8' : '0 0 8 12'" aria-hidden="true" focusable="false">
    <path :d="kind === 'check' ? 'M1 5.2 4.2 8.3 11 1.3' : kind === 'left' ? 'M6.5 1 1.5 6 6.5 11' : kind === 'right' ? 'M1.5 1 6.5 6 1.5 11' : 'M1 1.5 6 6.5 11 1.5'"
      fill="none" stroke="currentColor" :stroke-width="kind === 'check' ? 1.7 : 1.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>
