<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

type Country = Readonly<{ code: string; name: string }>;
type FeedbackOptions = Readonly<{ severity?: string; actionLabel?: string; onAction?: () => void }>;
type StreamingApi = Readonly<{
  getStreamingRegion: () => string;
  setStreamingRegion: (value: string) => string;
  resolveCountryInput: (value: string) => string;
  filterCountries: (query: string, items?: Country[]) => Country[];
  getCountryName: (code: string) => string;
  loadCountries: () => Promise<Country[]>;
  resetProviderRuntime: () => void;
}>;
type SettingsOwner = Readonly<{
  open: (section: string, options?: Record<string, unknown>) => unknown;
  routeFor: (section: string) => string;
  sections: ReadonlyArray<Readonly<{ id: string; label: string }>>;
}>;

declare global {
  interface Window {
    TVTrackerStreamingRegion?: StreamingApi;
    TVTrackerSettings?: SettingsOwner;
    TVTrackerFeedback?: { notify?: (message: string, options?: FeedbackOptions) => unknown };
    showToast?: (message: string, options?: FeedbackOptions) => unknown;
    saveData?: (options?: { stateKeys?: string[] }) => Promise<unknown>;
    TVTrackerClientRuntime?: { report?: (details: Record<string, unknown>) => Promise<unknown> | unknown };
  }
}

const api = window.TVTrackerStreamingRegion as StreamingApi;
if (!api) {
  throw new Error('Streaming Settings API unavailable.');
}

const countries = ref<Country[]>([]);
const query = ref('');
const chosen = ref(api.getStreamingRegion());
const menuOpen = ref(false);
const loading = ref(false);
const saving = ref(false);
const loadFailed = ref(false);
const activeIndex = ref(-1);
const inputElement = ref<HTMLInputElement | null>(null);
const rootElement = ref<HTMLElement | null>(null);

const sections = computed(() => window.TVTrackerSettings?.sections ?? [
  { id: 'profile', label: 'PROFILE' },
  { id: 'auth', label: 'AUTH' },
  { id: 'notifications', label: 'NOTIFICATIONS' },
  { id: 'streaming', label: 'STREAMING' },
  { id: 'data', label: 'DATA' },
  { id: 'danger-zone', label: 'DANGER ZONE' }
]);

const visibleCountries = computed(() => api.filterCountries(query.value, countries.value));
const activeOptionId = computed(() => {
  const item = activeIndex.value >= 0 ? visibleCountries.value[activeIndex.value] : undefined;
  return item ? optionId(item) : '';
});

function notify(message: string, options: FeedbackOptions = {}): void {
  if (window.TVTrackerFeedback?.notify) {
    window.TVTrackerFeedback.notify(message, options);
    return;
  }
  window.showToast?.(message, options);
}

function optionId(item: Country): string {
  return `settings-vue-region-option-${item.code.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
}

function countryLabel(code: string): string {
  return code ? api.getCountryName(code) : '';
}

function closeMenu(): void {
  menuOpen.value = false;
  activeIndex.value = -1;
}

async function ensureCountries(): Promise<void> {
  if (countries.value.length || loading.value) return;
  loading.value = true;
  loadFailed.value = false;
  try {
    countries.value = await api.loadCountries();
  } catch {
    countries.value = [];
    loadFailed.value = true;
    window.TVTrackerClientRuntime?.report?.({ category: 'provider', surface: 'settings', code: 'streaming_countries_failed' });
  } finally {
    loading.value = false;
  }
}

async function openMenu(): Promise<void> {
  menuOpen.value = true;
  activeIndex.value = -1;
  await ensureCountries();
}

function choose(item: Country): void {
  chosen.value = item.code;
  query.value = item.name;
  closeMenu();
  void nextTick(() => inputElement.value?.focus());
}

function clearRegion(): void {
  chosen.value = '';
  query.value = '';
  closeMenu();
  void nextTick(() => inputElement.value?.focus());
}

function resolveInput(): string | null {
  const raw = query.value.trim();
  if (!raw) return '';
  if (chosen.value && countryLabel(chosen.value).toLowerCase() === raw.toLowerCase()) {
    return chosen.value;
  }
  const resolved = api.resolveCountryInput(raw);
  return resolved || null;
}

async function saveRegion(): Promise<void> {
  const next = resolveInput();
  if (next === null) {
    notify('Choose a country from the streaming region list or clear the field.', { severity: 'warning' });
    await openMenu();
    inputElement.value?.focus();
    return;
  }
  if (typeof window.saveData !== 'function') {
    notify('Couldn’t save your changes.', { severity: 'error' });
    return;
  }

  const before = api.getStreamingRegion();
  saving.value = true;
  try {
    api.setStreamingRegion(next);
    await window.saveData({ stateKeys: ['profile'] });
    chosen.value = next;
    query.value = countryLabel(next);
    if (before !== next) api.resetProviderRuntime();
    notify('Settings saved', { severity: 'success' });
  } catch {
    api.setStreamingRegion(before);
    chosen.value = before;
    query.value = countryLabel(before);
    notify('Couldn’t save your changes.', { severity: 'error' });
  } finally {
    saving.value = false;
  }
}

function onInput(): void {
  chosen.value = '';
  activeIndex.value = -1;
  void openMenu();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (menuOpen.value) event.preventDefault();
    closeMenu();
    return;
  }
  if (event.key === 'Tab') {
    closeMenu();
    return;
  }

  const items = visibleCountries.value;
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    if (!menuOpen.value) void openMenu();
    if (!items.length) return;
    if (event.key === 'Home') activeIndex.value = 0;
    else if (event.key === 'End') activeIndex.value = items.length - 1;
    else if (event.key === 'ArrowDown') activeIndex.value = activeIndex.value < 0 ? 0 : (activeIndex.value + 1) % items.length;
    else activeIndex.value = activeIndex.value < 0 ? items.length - 1 : (activeIndex.value - 1 + items.length) % items.length;
    return;
  }

  if (event.key === 'Enter' && menuOpen.value && activeIndex.value >= 0) {
    const item = items[activeIndex.value];
    if (item) {
      event.preventDefault();
      choose(item);
    }
  }
}

function routeFor(section: string): string {
  return window.TVTrackerSettings?.routeFor(section) ?? `/app/settings/${section}`;
}

function navigate(section: string, event: MouseEvent): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.TVTrackerSettings?.open(section, { fromRoute: false });
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target;
  if (menuOpen.value && target instanceof Node && rootElement.value && !rootElement.value.contains(target)) closeMenu();
}

onMounted(() => {
  query.value = countryLabel(chosen.value);
  document.addEventListener('click', onDocumentClick);
  void ensureCountries();
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
});
</script>

<template>
  <div class="settings-v2" data-tvtracker-vue-settings="streaming">
    <header class="settings-v2-header">
      <h1 class="settings-v2-title">Account Settings</h1>
      <nav class="settings-v2-tabs" aria-label="Account Settings sections">
        <a
          v-for="section in sections"
          :key="section.id"
          class="settings-v2-tab"
          :href="routeFor(section.id)"
          :aria-current="section.id === 'streaming' ? 'page' : undefined"
          @click="navigate(section.id, $event)"
        >{{ section.label }}</a>
      </nav>
    </header>

    <div class="settings-v2-body" data-settings-body>
      <section class="settings-v2-section">
        <h2>Streaming</h2>
        <p class="settings-v2-copy">Choose the country used for Where to Watch and streaming-service filters.</p>
        <div class="settings-v2-field">
          <label for="settings-vue-region-input">Streaming Region</label>
          <div ref="rootElement" class="settings-v2-streaming-combobox">
            <input
              id="settings-vue-region-input"
              ref="inputElement"
              v-model="query"
              class="settings-v2-input"
              type="search"
              autocomplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="settings-vue-region-menu"
              :aria-expanded="menuOpen ? 'true' : 'false'"
              :aria-activedescendant="activeOptionId"
              placeholder="Search countries"
              @focus="openMenu"
              @click="openMenu"
              @input="onInput"
              @keydown="onKeydown"
            >
            <div id="settings-vue-region-menu" class="settings-v2-region-menu" role="listbox" :hidden="!menuOpen">
              <div v-if="loading" class="settings-v2-region-empty" role="status">Loading countries…</div>
              <div v-else-if="loadFailed" class="settings-v2-region-empty">Country list is temporarily unavailable.</div>
              <div v-else-if="!visibleCountries.length" class="settings-v2-region-empty">No countries found.</div>
              <template v-else>
                <button
                  v-for="(item, index) in visibleCountries"
                  :id="optionId(item)"
                  :key="item.code"
                  class="settings-v2-region-option"
                  :class="{ 'is-active': index === activeIndex }"
                  type="button"
                  role="option"
                  :aria-selected="item.code === chosen ? 'true' : 'false'"
                  @mousemove="activeIndex = index"
                  @click="choose(item)"
                >
                  <span>{{ item.name }}</span><small class="settings-v2-region-code">{{ item.code }}</small>
                </button>
              </template>
            </div>
          </div>
        </div>
        <div class="settings-v2-actions">
          <button class="settings-v2-button" type="button" :disabled="saving" @click="clearRegion">Clear Region</button>
          <button class="settings-v2-button settings-v2-button--primary" type="button" :disabled="saving" @click="saveRegion">
            {{ saving ? 'Saving…' : 'Save Region' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
