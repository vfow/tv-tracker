<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { feedback } from '../ui/feedback';

type ProfileDraft = {
  username?: string;
  avatar_type?: string;
  avatar_preset?: string;
  avatar_data?: string;
  header_type?: string;
  header_preset?: string;
  header_image?: string;
  adult_filter?: boolean;
  [key: string]: unknown;
};
type SettingsOwner = Readonly<{
  open: (section: string, options?: Record<string, unknown>) => unknown;
  routeFor: (section: string) => string;
  sections: ReadonlyArray<Readonly<{ id: string; label: string }>>;
}>;

declare global {
  interface Window {
    DATA?: { profile?: ProfileDraft };
    profileSettingsDraft?: ProfileDraft | null;
    createProfileSettingsDraft?: () => ProfileDraft;
    getProfileAvatarInnerHTML?: (profile: ProfileDraft) => string;
    getProfileHeaderPreviewHTML?: (profile: ProfileDraft) => string;
    getProfileInitial?: (username?: string) => string;
    getPresetAvatarSVG?: (preset: string) => string;
    updateProfileSettingsPreview?: () => void;
    openAvatarFilePicker?: () => void;
    openProfileHeaderFilePicker?: () => void;
    saveProfileSettings?: (settings: ProfileDraft) => Promise<unknown>;
    TVTrackerAdultPolicy?: { refresh?: () => unknown };
    TVTrackerSettings?: SettingsOwner;
    TVTrackerClientRuntime?: { report?: (details: Record<string, unknown>) => Promise<unknown> | unknown };
  }
}

const fallbackProfile = window.DATA?.profile && typeof window.DATA.profile === 'object'
  ? { ...window.DATA.profile }
  : {};
const draft = window.createProfileSettingsDraft?.() ?? fallbackProfile;
if (typeof draft.adult_filter !== 'boolean') draft.adult_filter = true;
window.profileSettingsDraft = draft;

const username = ref(String(draft.username || 'Username'));
const adultFilter = ref(draft.adult_filter !== false);
const saving = ref(false);
const bridgeUnavailable = ref(false);

const sections = computed(() => window.TVTrackerSettings?.sections ?? [
  { id: 'profile', label: 'PROFILE' },
  { id: 'auth', label: 'AUTH' },
  { id: 'notifications', label: 'NOTIFICATIONS' },
  { id: 'streaming', label: 'STREAMING' },
  { id: 'data', label: 'DATA' },
  { id: 'danger-zone', label: 'DANGER ZONE' }
]);

const avatarHtml = computed(() => window.getProfileAvatarInnerHTML?.(draft) ?? '');
const headerHtml = computed(() => window.getProfileHeaderPreviewHTML?.(draft) ?? '');
const initial = computed(() => window.getProfileInitial?.(username.value) ?? (username.value.trim().charAt(0).toUpperCase() || 'U'));
const presets = ['silhouette-1', 'silhouette-2', 'silhouette-3', 'silhouette-4'] as const;
const headerPresets = [
  ['default', 'Default'],
  ['blue', 'Blue'],
  ['purple', 'Purple'],
  ['green', 'Green'],
  ['amber', 'Amber'],
  ['monochrome', 'Monochrome']
] as const;

function routeFor(section: string): string {
  return window.TVTrackerSettings?.routeFor(section) ?? `/app/settings/${section}`;
}

function navigate(section: string, event: MouseEvent): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.TVTrackerSettings?.open(section, { fromRoute: false });
}

function refreshLegacyPreview(): void {
  void nextTick(() => window.updateProfileSettingsPreview?.());
}

function onUsernameInput(): void {
  draft.username = username.value;
  refreshLegacyPreview();
}

function chooseInitial(): void {
  draft.avatar_type = 'initial';
  draft.avatar_data = '';
  refreshLegacyPreview();
}

function choosePreset(preset: string): void {
  draft.avatar_type = 'preset';
  draft.avatar_preset = preset;
  draft.avatar_data = '';
  refreshLegacyPreview();
}

function presetSvg(preset: string): string {
  return window.getPresetAvatarSVG?.(preset) ?? '';
}

function uploadAvatar(): void {
  if (typeof window.openAvatarFilePicker !== 'function') {
    bridgeUnavailable.value = true;
    feedback.error('Avatar upload is temporarily unavailable.');
    return;
  }
  window.openAvatarFilePicker();
}

function removeAvatar(): void {
  draft.avatar_type = 'initial';
  draft.avatar_data = '';
  refreshLegacyPreview();
}

function chooseHeaderPreset(preset: string): void {
  draft.header_type = 'preset';
  draft.header_preset = preset;
  draft.header_image = '';
  refreshLegacyPreview();
}

function uploadHeader(): void {
  if (typeof window.openProfileHeaderFilePicker !== 'function') {
    bridgeUnavailable.value = true;
    feedback.error('Header upload is temporarily unavailable.');
    return;
  }
  window.openProfileHeaderFilePicker();
}

function removeHeader(): void {
  draft.header_type = 'preset';
  draft.header_preset = 'default';
  draft.header_image = '';
  refreshLegacyPreview();
}

async function saveProfile(): Promise<void> {
  if (typeof window.saveProfileSettings !== 'function') {
    bridgeUnavailable.value = true;
    feedback.error('Couldn’t save your changes.');
    return;
  }

  draft.username = username.value;
  draft.adult_filter = adultFilter.value;
  const liveProfile = window.DATA?.profile;
  const previousAdultFilter = liveProfile?.adult_filter !== false;
  if (liveProfile) liveProfile.adult_filter = adultFilter.value;

  saving.value = true;
  try {
    await window.saveProfileSettings(draft);
    window.TVTrackerAdultPolicy?.refresh?.();
    feedback.success('Settings saved');
  } catch (error) {
    if (liveProfile) liveProfile.adult_filter = previousAdultFilter;
    adultFilter.value = previousAdultFilter;
    draft.adult_filter = previousAdultFilter;
    feedback.presentError(error, 'Couldn’t save your changes.', { context: 'profile settings save' });
    feedback.error('Couldn’t save your changes.', { key: 'profile-save-retry', actionLabel: 'Retry', onAction: () => void saveProfile() });
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  const required = [
    window.createProfileSettingsDraft,
    window.getProfileAvatarInnerHTML,
    window.getProfileHeaderPreviewHTML,
    window.updateProfileSettingsPreview,
    window.saveProfileSettings
  ];
  bridgeUnavailable.value = required.some(item => typeof item !== 'function');
  if (bridgeUnavailable.value) {
    window.TVTrackerClientRuntime?.report?.({ category: 'runtime', surface: 'settings', code: 'vue_profile_bridge_unavailable' });
  }
  refreshLegacyPreview();
});
</script>

<template>
  <div class="settings-v2" data-tvtracker-vue-profile-settings="profile">
    <header class="settings-v2-header">
      <h1 class="settings-v2-title">Account Settings</h1>
      <nav class="settings-v2-tabs" aria-label="Account Settings sections">
        <a
          v-for="section in sections"
          :key="section.id"
          class="settings-v2-tab"
          :href="routeFor(section.id)"
          :aria-current="section.id === 'profile' ? 'page' : undefined"
          @click="navigate(section.id, $event)"
        >{{ section.label }}</a>
      </nav>
    </header>

    <div class="settings-v2-body" data-settings-body>
      <section class="settings-v2-section settings-v2-profile-section">
        <h2>Profile</h2>
        <p class="settings-v2-copy">Update how your profile appears in TV Tracker.</p>
        <p v-if="bridgeUnavailable" class="settings-v2-copy" role="status">Some profile controls are temporarily unavailable.</p>

        <div class="settings-v2-avatar-row">
          <div id="settings-avatar-preview" class="settings-v2-avatar-preview" v-html="avatarHtml"></div>
          <div>
            <div class="settings-v2-field">
              <label for="profile-username-input">Username</label>
              <input
                id="profile-username-input"
                v-model="username"
                class="settings-v2-input"
                type="text"
                maxlength="30"
                @input="onUsernameInput"
              >
            </div>
            <span class="settings-v2-label">Avatar</span>
            <div class="settings-v2-presets">
              <button type="button" data-avatar-type="initial" title="Use username initial" @click="chooseInitial">
                <span class="avatar-initial-option">{{ initial }}</span>
              </button>
              <button
                v-for="preset in presets"
                :key="preset"
                type="button"
                data-avatar-type="preset"
                :data-avatar-preset="preset"
                title="Choose preset avatar"
                @click="choosePreset(preset)"
                v-html="presetSvg(preset)"
              ></button>
            </div>
            <div class="settings-v2-actions">
              <button id="upload-profile-avatar" class="settings-v2-button" type="button" @click="uploadAvatar">Upload Image</button>
              <button id="remove-profile-avatar" class="settings-v2-button" type="button" @click="removeAvatar">Remove Avatar</button>
            </div>
          </div>
        </div>

        <div class="settings-v2-field" style="margin-top:28px">
          <span class="settings-v2-label">Profile Header</span>
          <div id="profile-header-preview-wrap" v-html="headerHtml"></div>
        </div>
        <div class="settings-v2-header-presets">
          <button
            v-for="preset in headerPresets"
            :key="preset[0]"
            class="settings-v2-button profile-header-preset-button"
            :class="`profile-header-${preset[0]}`"
            type="button"
            :data-profile-header-preset="preset[0]"
            @click="chooseHeaderPreset(preset[0])"
          >{{ preset[1] }}</button>
        </div>
        <div class="settings-v2-actions">
          <button id="upload-profile-header" class="settings-v2-button" type="button" @click="uploadHeader">Upload Header Image</button>
          <button id="remove-profile-header" class="settings-v2-button" type="button" @click="removeHeader">Use Default Header</button>
          <button id="save-profile-settings" class="settings-v2-button settings-v2-button--primary" type="button" :disabled="saving" @click="saveProfile">
            {{ saving ? 'Saving…' : 'Save Profile' }}
          </button>
        </div>
        <label class="settings-v2-check-row" for="adult-filter-input">
          <input id="adult-filter-input" v-model="adultFilter" type="checkbox">
          <span class="settings-v2-check-copy">
            <strong>Adult filter</strong>
            <span>Hide movies and TV shows that TMDB classifies as adult content. Existing tracked titles are hidden, not deleted.</span>
          </span>
        </label>
      </section>
    </div>
  </div>
</template>