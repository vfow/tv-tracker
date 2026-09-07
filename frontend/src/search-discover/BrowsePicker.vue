<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from 'vue';
import type { BrowseActions, BrowsePickerType, BrowsePickerItem, BrowseChoice } from './browseViewModel';
import BrowseIcon from './BrowseIcon.vue';
const props = defineProps<{type: BrowsePickerType; selected: readonly BrowseChoice[]; actions: BrowseActions}>();
const query = ref('');
const items = ref<readonly BrowsePickerItem[]>([]);
const status = ref('Type at least 2 characters.');
const heading = computed(() => props.type === 'theme' ? 'Theme' : props.type === 'company' ? 'Production Company' : 'Network');
const searchLabel = computed(() => props.type === 'theme' ? 'Search themes' : props.type === 'company' ? 'Search production companies' : 'Search networks');
let timer: ReturnType<typeof setTimeout> | undefined;
let request = 0;
watch(query, value => {
  clearTimeout(timer); const serial = ++request; const clean = value.trim(); items.value = [];
  status.value = clean.length < 2 ? 'Type at least 2 characters.' : 'Searching…';
  if (clean.length < 2) return;
  timer = setTimeout(async () => {
    try { const result = await props.actions.searchPicker(props.type, clean); if(serial !== request) return; items.value = result; status.value = result.length ? '' : 'No matches found.'; }
    catch { if(serial === request) status.value = 'Couldn’t load matches.'; }
  }, 220);
});
onBeforeUnmount(() => { clearTimeout(timer); request++; });
function choice(item: BrowsePickerItem): BrowseChoice {
  return {key: props.type === 'theme' ? 'themes' : props.type === 'company' ? 'companies' : 'network', value:item.id, label:item.label, multi:props.type !== 'network', selected:props.selected.some(value=>value.value === item.id)};
}
</script>
<template>
  <div class="browse-other-section">
    <span class="browse-other-heading">{{ heading }}</span>
    <div v-if="selected.length" class="browse-selected-block"><div class="browse-option-list"><button v-for="item in selected" :key="item.value" type="button" class="browse-dropdown-option browse-selected-option selected" @click.stop="actions.choose(type === 'network' ? {...item,value:''} : item)"><span>{{ item.label }}</span><BrowseIcon kind="check" /></button></div></div>
    <input v-model="query" class="browse-dropdown-search" type="search" :placeholder="searchLabel" :aria-label="searchLabel">
    <div class="browse-picker-results" aria-live="polite">
      <div v-if="status" class="browse-picker-empty">{{ status }}</div>
      <button v-for="item in items" :key="item.id" type="button" class="browse-picker-result" :class="{selected:choice(item).selected}" @click.stop="actions.choose(choice(item))">
        <span class="browse-picker-main"><img v-if="item.logo" class="browse-picker-logo" :src="item.logo" alt="" loading="lazy"><span class="browse-picker-copy"><span class="browse-picker-name">{{ item.name }}</span><span v-if="item.country" class="browse-picker-meta">{{ item.country }}</span></span></span><BrowseIcon v-if="choice(item).selected" kind="check" />
      </button>
    </div>
  </div>
</template>
