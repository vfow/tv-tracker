<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';

type NotificationRuntime = Readonly<{
  renderNotificationControls: (list: HTMLElement) => Promise<void> | void;
}>;
type SettingsOwner = Readonly<{
  open: (section: string, options?: Record<string, unknown>) => unknown;
  routeFor: (section: string) => string;
  sections: ReadonlyArray<Readonly<{ id: string; label: string }>>;
}>;

declare global {
  interface Window {
    TVTrackerNotificationsRuntime?: NotificationRuntime;
    TVTrackerSettings?: SettingsOwner;
    TVTrackerClientRuntime?: { report?: (details: Record<string, unknown>) => Promise<unknown> | unknown };
  }
}

const controlsElement = ref<HTMLElement | null>(null);
const bridgeUnavailable = ref(false);

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

async function mountCanonicalControls(): Promise<void> {
  await nextTick();
  const list = controlsElement.value;
  const runtime = window.TVTrackerNotificationsRuntime;
  if (!list || !runtime || typeof runtime.renderNotificationControls !== 'function') {
    bridgeUnavailable.value = true;
    window.TVTrackerClientRuntime?.report?.({
      category: 'runtime',
      surface: 'settings',
      code: 'vue_notifications_runtime_unavailable'
    });
    return;
  }
  bridgeUnavailable.value = false;
  await runtime.renderNotificationControls(list);
}

onMounted(() => {
  void mountCanonicalControls();
});
</script>

<template>
  <div class="settings-v2" data-tvtracker-vue-notifications-settings="notifications">
    <header class="settings-v2-header">
      <h1 class="settings-v2-title">Account Settings</h1>
      <nav class="settings-v2-tabs" aria-label="Account Settings sections">
        <a
          v-for="section in sections"
          :key="section.id"
          class="settings-v2-tab"
          :href="routeFor(section.id)"
          :aria-current="section.id === 'notifications' ? 'page' : undefined"
          @click="navigate(section.id, $event)"
        >{{ section.label }}</a>
      </nav>
    </header>

    <div class="settings-v2-body" data-settings-body>
      <section class="settings-v2-section">
        <h2>Notifications</h2>
        <div
          id="settings-v2-notification-list"
          ref="controlsElement"
          class="notification-settings-list"
          aria-label="Notification settings"
        >
          <div v-if="bridgeUnavailable" class="notifications-empty">Notification settings are temporarily unavailable.</div>
          <div v-else class="notifications-loading">Loading notification settings…</div>
        </div>
      </section>
    </div>
  </div>
</template>
