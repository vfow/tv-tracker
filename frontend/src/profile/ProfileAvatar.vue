<script setup lang="ts">
import { computed } from 'vue';
import PresetAvatar from './PresetAvatar.vue';

const props = defineProps<{ profile: {
  username?: string;
  avatar_type?: string;
  avatar_preset?: string;
  avatar_data?: string;
} }>();
const initial = computed(() => String(props.profile.username || 'Username').trim().match(/[A-Za-z0-9]/)?.[0].toUpperCase() || 'U');
</script>

<template>
  <img v-if="profile.avatar_type === 'upload' && profile.avatar_data" class="profile-avatar-image" :src="profile.avatar_data" alt="Profile avatar">
  <div v-else-if="profile.avatar_type === 'preset'" class="profile-avatar-preset"><PresetAvatar :preset="profile.avatar_preset || 'silhouette-1'" /></div>
  <span v-else class="profile-avatar-initial">{{ initial }}</span>
</template>
