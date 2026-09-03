<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

type SettingsOwner = Readonly<{
  open: (section: string, options?: Record<string, unknown>) => unknown;
  routeFor: (section: string) => string;
  sections: ReadonlyArray<Readonly<{ id: string; label: string }>>;
}>;

type BackupSummary = Readonly<{
  shows?: number;
  movies?: number;
  historyEntries?: number;
  favorites?: number;
}>;

type TrackerDataWindow = Window & {
  DATA?: {
    movies?: Record<string, unknown>;
  };
};

declare global {
  interface Window {
    getBackupSummary?: () => BackupSummary;
    exportNativeBackupJSON?: () => unknown;
    importNativeBackupJSON?: () => unknown;
    exportHTMLReport?: () => unknown;
    TVTrackerSettings?: SettingsOwner;
    TVTrackerClientRuntime?: { report?: (details: Record<string, unknown>) => Promise<unknown> | unknown };
  }
}

const bridgeUnavailable = ref(false);
const rawSummary = window.getBackupSummary?.() ?? { shows: 0, historyEntries: 0, favorites: 0 };
const summary: BackupSummary = {
  ...rawSummary,
  movies: Object.keys((window as TrackerDataWindow).DATA?.movies ?? {}).length
};

const sections = computed(() => window.TVTrackerSettings?.sections ?? [
  { id: 'profile', label: 'PROFILE' },
  { id: 'auth', label: 'AUTH' },
  { id: 'notifications', label: 'NOTIFICATIONS' },
  { id: 'streaming', label: 'STREAMING' },
  { id: 'data', label: 'DATA' },
  { id: 'danger-zone', label: 'DANGER ZONE' }
]);

const formattedSummary = computed(() => ({
  shows: Number(summary.shows ?? 0).toLocaleString(),
  movies: Number(summary.movies ?? 0).toLocaleString(),
  historyEntries: Number(summary.historyEntries ?? 0).toLocaleString(),
  favorites: Number(summary.favorites ?? 0).toLocaleString()
}));

function routeFor(section: string): string {
  return window.TVTrackerSettings?.routeFor(section) ?? `/app/settings/${section}`;
}

function navigate(section: string, event: MouseEvent): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.TVTrackerSettings?.open(section, { fromRoute: false });
}

function reportUnavailable(code: string): void {
  bridgeUnavailable.value = true;
  window.TVTrackerClientRuntime?.report?.({ category: 'runtime', surface: 'settings', code });
}

function exportBackup(): void {
  if (typeof window.exportNativeBackupJSON !== 'function') {
    reportUnavailable('vue_data_export_backup_bridge_unavailable');
    return;
  }
  void window.exportNativeBackupJSON();
}

function importBackup(): void {
  if (typeof window.importNativeBackupJSON !== 'function') {
    reportUnavailable('vue_data_import_backup_bridge_unavailable');
    return;
  }
  void window.importNativeBackupJSON();
}

function exportReport(): void {
  if (typeof window.exportHTMLReport !== 'function') {
    reportUnavailable('vue_data_export_report_bridge_unavailable');
    return;
  }
  void window.exportHTMLReport();
}

onMounted(() => {
  const required = [
    window.getBackupSummary,
    window.exportNativeBackupJSON,
    window.importNativeBackupJSON,
    window.exportHTMLReport
  ];
  bridgeUnavailable.value = required.some(item => typeof item !== 'function');
  if (bridgeUnavailable.value) {
    window.TVTrackerClientRuntime?.report?.({ category: 'runtime', surface: 'settings', code: 'vue_data_bridge_unavailable' });
  }
});
</script>

<template>
  <div class="settings-v2" data-tvtracker-vue-data-settings="data">
    <header class="settings-v2-header">
      <h1 class="settings-v2-title">Account Settings</h1>
      <nav class="settings-v2-tabs" aria-label="Account Settings sections">
        <a
          v-for="section in sections"
          :key="section.id"
          class="settings-v2-tab"
          :href="routeFor(section.id)"
          :aria-current="section.id === 'data' ? 'page' : undefined"
          @click="navigate(section.id, $event)"
        >{{ section.label }}</a>
      </nav>
    </header>

    <div class="settings-v2-body" data-settings-body>
      <section class="settings-v2-section">
        <h2>Data</h2>
        <p class="settings-v2-copy">Export, import, or create a readable report of your data.</p>
        <p v-if="bridgeUnavailable" class="settings-v2-copy" role="status">Some data tools are temporarily unavailable.</p>
        <div class="settings-v2-summary">
          <div><span>Shows</span><strong>{{ formattedSummary.shows }}</strong></div>
          <div><span>Movies</span><strong>{{ formattedSummary.movies }}</strong></div>
          <div><span>History Entries</span><strong>{{ formattedSummary.historyEntries }}</strong></div>
          <div><span>Favorites</span><strong>{{ formattedSummary.favorites }}</strong></div>
        </div>
        <div class="settings-v2-actions">
          <button id="export-native-backup-button" class="settings-v2-button settings-v2-button--primary" type="button" @click="exportBackup">Export App Backup JSON</button>
          <button id="import-native-backup-button" class="settings-v2-button" type="button" @click="importBackup">Import App Backup JSON</button>
          <button id="export-html-report-button" class="settings-v2-button" type="button" @click="exportReport">Export HTML Report</button>
        </div>
      </section>
    </div>
  </div>
</template>
