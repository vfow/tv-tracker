<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { TrackerListControlKey, TrackerListControlsModel, TrackerListsRendererActions } from './contracts';

const props = defineProps<{model: TrackerListControlsModel; actions: TrackerListsRendererActions}>();
const hasSlots = Boolean(document.getElementById('library-filter-slot') && document.getElementById('library-search-slot'));
const open = ref(false);
const menuElement = ref<HTMLElement | null>(null);
const toggleElement = ref<HTMLButtonElement | null>(null);
const selects = [
  {key: 'genre', title: 'Genre', label: 'Filter by genre', all: 'All Genres', options: 'genres'},
  {key: 'network', title: 'Network', label: 'Filter by network', all: 'All Networks', options: 'networks'},
  {key: 'year', title: 'Year', label: 'Filter by year', all: 'All Years', options: 'years'},
] as const;
const sorts = [
  ['default', 'Default Order'], ['title-az', 'Title A–Z'], ['title-za', 'Title Z–A'],
  ['recently-added', 'Recently Added'], ['recently-watched', 'Recently Watched'],
  ['rating-desc', 'Rating High to Low'], ['year-newest', 'Release Year Newest'], ['year-oldest', 'Release Year Oldest'],
];

function change(key: TrackerListControlKey, event: Event): void {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) props.actions.changeControl(key, target.value);
}
function reset(): void {
  props.actions.resetControls();
  open.value = false;
  toggleElement.value?.focus();
}
function outside(event: MouseEvent): void {
  if (event.target instanceof Node && !menuElement.value?.contains(event.target)) open.value = false;
}
function escape(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !open.value) return;
  open.value = false;
  toggleElement.value?.focus();
}
onMounted(() => {
  document.addEventListener('click', outside);
  document.addEventListener('keydown', escape);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', outside);
  document.removeEventListener('keydown', escape);
});
</script>

<template>
  <Teleport v-if="hasSlots" to="#library-filter-slot">
    <div id="library-filter-menu" ref="menuElement" class="library-filter-menu" data-tvtracker-library-controls="vue">
      <button id="library-filter-toggle" ref="toggleElement" class="library-filter-toggle" type="button" aria-label="Filters" :aria-expanded="open ? 'true' : 'false'" aria-controls="library-filter-dropdown" @click="open = !open">
        <img src="/static/assets/icons/filter.svg" alt="">
      </button>
      <div id="library-filter-dropdown" class="library-filter-dropdown" :hidden="!open">
        <template v-for="select in selects" :key="select.key">
          <label class="library-filter-label" :for="`library-${select.key}-filter`">{{ select.title }}</label>
          <select :id="`library-${select.key}-filter`" class="library-filter-select" :aria-label="select.label" :value="model[select.key]" @change="change(select.key, $event)">
            <option value="all">{{ select.all }}</option>
            <option v-for="option in model[select.options]" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </template>
        <label class="library-filter-label" for="library-sort-mode">Sort</label>
        <select id="library-sort-mode" class="library-filter-select library-sort-select" aria-label="Sort library" :value="model.sort" @change="change('sort', $event)">
          <option v-for="sort in sorts" :key="sort[0]" :value="sort[0]">{{ sort[1] }}</option>
        </select>
        <button id="library-reset-filters" class="library-reset-button" type="button" :hidden="!model.active" @click="reset">Reset Filters</button>
      </div>
    </div>
  </Teleport>
  <Teleport v-if="hasSlots" to="#library-search-slot">
    <div id="library-search-box" class="library-search-box library-control-row">
      <input id="library-search" class="library-search-input" type="search" :placeholder="model.placeholder" :aria-label="model.placeholder" :value="model.query" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off" data-lpignore="true" data-form-type="other" @input="change('query', $event)">
    </div>
  </Teleport>
</template>
