<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

type SettingsOwner = Readonly<{
  open: (section: string, options?: Record<string, unknown>) => unknown;
  routeFor: (section: string) => string;
  sections: ReadonlyArray<Readonly<{ id: string; label: string }>>;
}>;

type ClientStorage = Readonly<{
  clearOnLogout?: () => unknown;
}>;

declare global {
  interface Window {
    getAdminAccountUsername?: () => string;
    loadAdminAccountIntoSettings?: (force?: boolean) => Promise<unknown> | unknown;
    saveAdminAccountChanges?: () => Promise<unknown> | unknown;
    csrfToken?: () => string;
    TVTrackerCore?: { clientStorage?: ClientStorage };
    TVTrackerSettings?: SettingsOwner;
    TVTrackerClientRuntime?: { report?: (details: Record<string, unknown>) => Promise<unknown> | unknown };
  }
}

const bridgeUnavailable = ref(false);
const initialUsername = window.getAdminAccountUsername?.() ?? '';

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

function csrfToken(): string {
  if (typeof window.csrfToken === 'function') return window.csrfToken();
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
  return String(meta?.content ?? '');
}

function markUsernameEdited(event: Event): void {
  const input = event.currentTarget;
  if (input instanceof HTMLInputElement) input.dataset.userEdited = 'true';
}

function saveAccount(event: SubmitEvent): void {
  event.preventDefault();
  if (typeof window.saveAdminAccountChanges !== 'function') {
    bridgeUnavailable.value = true;
    window.TVTrackerClientRuntime?.report?.({ category: 'runtime', surface: 'settings', code: 'vue_auth_save_bridge_unavailable' });
    return;
  }
  void window.saveAdminAccountChanges();
}

function cleanupLogout(): void {
  const clientStorage = window.TVTrackerCore?.clientStorage;
  if (typeof clientStorage?.clearOnLogout !== 'function') return;
  try {
    clientStorage.clearOnLogout();
  } catch {
    // Logout must continue even when best-effort client storage cleanup fails.
  }
}

onMounted(() => {
  const required = [window.loadAdminAccountIntoSettings, window.saveAdminAccountChanges];
  bridgeUnavailable.value = required.some(item => typeof item !== 'function');
  if (bridgeUnavailable.value) {
    window.TVTrackerClientRuntime?.report?.({ category: 'runtime', surface: 'settings', code: 'vue_auth_bridge_unavailable' });
    return;
  }
  void window.loadAdminAccountIntoSettings?.();
});
</script>

<template>
  <div class="settings-v2" data-tvtracker-vue-auth-settings="auth">
    <header class="settings-v2-header">
      <h1 class="settings-v2-title">Account Settings</h1>
      <nav class="settings-v2-tabs" aria-label="Account Settings sections">
        <a
          v-for="section in sections"
          :key="section.id"
          class="settings-v2-tab"
          :href="routeFor(section.id)"
          :aria-current="section.id === 'auth' ? 'page' : undefined"
          @click="navigate(section.id, $event)"
        >{{ section.label }}</a>
      </nav>
    </header>

    <div class="settings-v2-body" data-settings-body>
      <section class="settings-v2-section">
        <h2>Auth</h2>
        <p class="settings-v2-copy">Change the private login username or password. Saving account changes signs out logged-in sessions.</p>
        <p v-if="bridgeUnavailable" class="settings-v2-copy" role="status">Account settings are temporarily unavailable.</p>
        <form id="admin-account-form" autocomplete="on" @submit="saveAccount">
          <div class="settings-v2-field">
            <label for="admin-username-input">Login username</label>
            <input
              id="admin-username-input"
              class="settings-v2-input"
              type="text"
              maxlength="80"
              autocomplete="username"
              :value="initialUsername"
              placeholder="Loading account..."
              @input="markUsernameEdited"
            >
          </div>
          <div class="settings-v2-field">
            <label for="admin-current-password-input">Current Password</label>
            <input id="admin-current-password-input" class="settings-v2-input" type="password" autocomplete="current-password">
          </div>
          <div class="settings-v2-field">
            <label for="admin-new-password-input">New Password</label>
            <input
              id="admin-new-password-input"
              class="settings-v2-input"
              type="password"
              minlength="10"
              autocomplete="new-password"
              placeholder="Leave blank to keep current password"
            >
          </div>
          <div class="settings-v2-field">
            <label for="admin-confirm-password-input">Confirm New Password</label>
            <input id="admin-confirm-password-input" class="settings-v2-input" type="password" minlength="10" autocomplete="new-password">
          </div>
          <p id="admin-account-status" class="settings-v2-copy" aria-live="polite"></p>
          <div class="settings-v2-actions">
            <button id="save-admin-account" class="settings-v2-button settings-v2-button--primary" type="submit">Save Account Changes</button>
          </div>
        </form>
      </section>

      <section class="settings-v2-section">
        <h2>Session</h2>
        <p class="settings-v2-copy">Sign out of this session.</p>
        <div class="settings-v2-actions">
          <form method="post" action="/logout" @submit="cleanupLogout">
            <input type="hidden" name="csrf_token" :value="csrfToken()">
            <button class="settings-v2-button" type="submit">Log Out</button>
          </form>
          <form method="post" action="/account/sign-out-all" @submit="cleanupLogout">
            <input type="hidden" name="csrf_token" :value="csrfToken()">
            <button class="settings-v2-button" type="submit">Sign Out All Devices</button>
          </form>
        </div>
      </section>
    </div>
  </div>
</template>
