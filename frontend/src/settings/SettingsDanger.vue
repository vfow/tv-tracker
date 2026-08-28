<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

type SettingsOwner = Readonly<{
  open: (section: string, options?: Record<string, unknown>) => unknown;
  routeFor: (section: string) => string;
  sections: ReadonlyArray<Readonly<{ id: string; label: string }>>;
}>;

declare global {
  interface Window {
    resetTrackerData?: () => Promise<unknown> | unknown;
    TVTrackerSettings?: SettingsOwner;
    TVTrackerClientRuntime?: { report?: (details: Record<string, unknown>) => Promise<unknown> | unknown };
  }
}

const resetUnavailable = ref(false);

const sections = computed(() => window.TVTrackerSettings?.sections ?? [
  { id: 'profile', label: 'PROFILE' },
  { id: 'auth', label: 'AUTH' },
  { id: 'notifications', label: 'NOTIFICATIONS' },
  { id: 'streaming', label: 'STREAMING' },
  { id: 'data', label: 'DATA' },
  { id: 'danger-zone', label: 'DANGER ZONE' }
]);

function routeFor(section: string): string {
  return window.TVTrackerSettings?.routeFor(section) ?? `/app/settings/${section}`;
}

function navigate(section: string, event: MouseEvent): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.TVTrackerSettings?.open(section, { fromRoute: false });
}

function resetTracker(): void {
  if (typeof window.resetTrackerData !== 'function') {
    resetUnavailable.value = true;
    window.TVTrackerClientRuntime?.report?.({ category: 'runtime', surface: 'settings', code: 'vue_danger_reset_bridge_unavailable' });
    return;
  }
  void window.resetTrackerData();
}

onMounted(() => {
  resetUnavailable.value = typeof window.resetTrackerData !== 'function';
  if (resetUnavailable.value) {
    window.TVTrackerClientRuntime?.report?.({ category: 'runtime', surface: 'settings', code: 'vue_danger_bridge_unavailable' });
  }
});
</script>

<template>
  <div class="settings-v2" data-tvtracker-vue-danger-settings="danger-zone">
    <header class="settings-v2-header">
      <h1 class="settings-v2-title">Account Settings</h1>
      <nav class="settings-v2-tabs" aria-label="Account Settings sections">
        <a
          v-for="section in sections"
          :key="section.id"
          class="settings-v2-tab"
          :href="routeFor(section.id)"
          :aria-current="section.id === 'danger-zone' ? 'page' : undefined"
          @click="navigate(section.id, $event)"
        >{{ section.label }}</a>
      </nav>
    </header>

    <div class="settings-v2-body" data-settings-body>
      <section class="settings-v2-section">
        <h2>Danger Zone</h2>
        <p class="settings-v2-copy">These actions affect tracker or account data.</p>
        <div class="settings-v2-actions">
          <button
            id="reset-data-button"
            class="settings-v2-button settings-v2-button--danger"
            type="button"
            :disabled="resetUnavailable"
            @click="resetTracker"
          >Reset Tracker Data</button>
        </div>
        <p v-if="resetUnavailable" class="settings-v2-disabled-note" role="status">Tracker reset is temporarily unavailable.</p>
      </section>

      <section class="settings-v2-section">
        <h2>Deactivate account</h2>
        <p class="settings-v2-copy">Temporarily disable your account while keeping its data.</p>
        <button class="settings-v2-button settings-v2-button--danger" type="button" disabled>Deactivate account</button>
        <p class="settings-v2-disabled-note">Available when user accounts are enabled.</p>
      </section>

      <section class="settings-v2-section">
        <h2>Delete account</h2>
        <p class="settings-v2-copy">Permanently delete the account and its TV Tracker data.</p>
        <button class="settings-v2-button settings-v2-button--danger" type="button" disabled>Delete account</button>
        <p class="settings-v2-disabled-note">Available when user accounts are enabled.</p>
      </section>
    </div>
  </div>
</template>
