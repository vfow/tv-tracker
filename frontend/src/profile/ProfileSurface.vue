<script setup lang="ts">
import { nextTick } from 'vue';
import type { FavoriteSlot, ProfileActions, ProfileModel } from './contracts';
import ProfileAvatar from './ProfileAvatar.vue';
const props = defineProps<{model: ProfileModel; actions: ProfileActions}>();
async function setView(view: 'home' | 'stats'): Promise<void> {
  props.actions.setView(view);
  await nextTick();
  document.getElementById(view === 'stats' ? 'profile-stats-back' : 'open-profile-stats')?.focus();
}
function openFavorite(event: MouseEvent, item: FavoriteSlot): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  event.preventDefault();
  props.actions.openFavorite(item);
}
</script>
<template>
  <div data-tvtracker-profile-owner="vue">
    <template v-if="model.view === 'home'">
      <div class="profile-hero" :class="model.headerClass">
        <template v-if="model.headerImage"><div class="profile-header-image-layer" aria-hidden="true"><img :src="model.headerImage" alt=""></div><div class="profile-header-image-overlay" aria-hidden="true"></div></template>
        <div class="profile-avatar"><ProfileAvatar :profile="model.identity" /></div>
        <div class="profile-name">{{ model.identity.username }}</div>
      </div>
      <button id="open-profile-stats" class="profile-stats-preview-card" type="button" aria-label="Open stats" @click="setView('stats')">
        <div class="profile-stats-preview-item"><div class="profile-stat-label">WATCH TIME</div><div class="profile-stat-value profile-stat-value-with-icon"><img class="profile-stat-icon" src="/static/assets/icons/WATCH%20TIME.svg" alt=""><span>{{ model.watchTime }}</span></div></div>
        <div class="profile-stats-preview-divider"></div>
        <div class="profile-stats-preview-item"><div class="profile-stat-label">EPISODES WATCHED</div><div class="profile-stat-value profile-stat-value-with-icon"><img class="profile-stat-icon" src="/static/assets/icons/EPISODES%20WATCHED.svg" alt=""><span>{{ model.episodes }}</span></div></div>
        <div class="profile-stats-preview-arrow">›</div>
      </button>
      <div v-for="group in model.favorites" :key="group.kind" class="profile-section">
        <div class="profile-section-header"><h2>{{ group.label }}</h2><button :id="group.kind === 'movie' ? 'edit-favorite-movies-button' : 'edit-favorites-button'" class="profile-edit-button" type="button" :data-favorite-kind="group.kind" @click="actions.editFavorites(group.kind)">Edit</button></div>
        <div class="profile-favorites-grid"><template v-for="(slot, index) in group.slots" :key="index">
          <a v-if="slot.id" class="profile-favorite-slot filled" :href="slot.route" :data-favorite-kind="slot.kind" data-favorite-action="open" :data-favorite-id="slot.id" :aria-label="`Open ${slot.title}`" @click="openFavorite($event, slot)"><img v-if="slot.poster" :src="slot.poster" alt=""><div v-else class="profile-favorite-placeholder">{{ slot.kind === 'movie' ? '🎬' : '📺' }}</div></a>
          <button v-else class="profile-favorite-slot empty" type="button" :data-favorite-kind="slot.kind" data-favorite-action="edit" :aria-label="`Add favorite ${slot.kind}`" @click="actions.editFavorites(slot.kind)">+</button>
        </template></div>
      </div>
    </template>
    <div v-else class="profile-stats-page">
      <button id="profile-stats-back" class="profile-stats-back" type="button" @click="setView('home')">‹ Back</button>
      <div class="profile-stats-title-block"><h1>STATS</h1></div>
      <div class="profile-detail-stats-grid"><div v-for="card in model.cards" :key="card.label" class="profile-detail-stat-card"><div class="profile-detail-stat-label">{{ card.label }}</div><div class="profile-detail-stat-value">{{ card.value }}</div></div></div>
      <div class="profile-ranked-stats-grid">
        <section v-for="group in [{name:'TOP SHOW GENRES',items:model.genres,network:false},{name:'TOP SHOW NETWORKS',items:model.networks,network:true}]" :key="group.name" class="profile-ranked-panel">
          <div class="profile-ranked-header"><h2>{{ group.name }}</h2></div>
          <div v-if="group.network && model.syncText" class="ranked-stats-sync" :class="{warning:model.syncWarning}">{{ model.syncText }}</div>
          <div class="profile-ranked-list"><div v-if="!group.items.length" class="ranked-stats-empty">No data available yet.</div>
            <div v-for="(item,index) in group.items" :key="index" class="ranked-stats-row"><div class="ranked-stats-rank">{{ index + 1 }}</div><div class="ranked-stats-name"><span v-if="item.logo" class="ranked-network-logo"><img :src="item.logo" :alt="item.name"></span><span>{{ item.name }}</span></div><div class="ranked-stats-count">{{ item.count }} shows</div><div class="ranked-stats-percent">{{ item.percentage }}%</div></div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
