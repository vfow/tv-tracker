<script setup lang="ts">
import type { UpcomingNotificationsViewModel } from './viewModel';

defineProps<{
  model: UpcomingNotificationsViewModel;
}>();
</script>

<template>
  <div
    v-if="model.surface === 'upcoming'"
    style="display: contents"
    data-tvtracker-upcoming-notifications-owner="vue-upcoming"
  >
    <div
      v-if="model.state === 'loading'"
      class="watchlist-initial-skeleton upcoming-initial-skeleton"
      role="status"
      aria-live="polite"
      aria-label="Loading upcoming episodes"
    >
      <div v-for="groupIndex in 2" :key="groupIndex" class="upcoming-group" aria-hidden="true">
        <div class="upcoming-group-title">
          <div :class="`watchlist-skeleton-block watchlist-skeleton-meta watchlist-skeleton-meta--${groupIndex}`"></div>
        </div>
        <div v-for="rowIndex in 3" :key="rowIndex" class="show upcoming-entry-card watchlist-skeleton-row">
          <div class="watchlist-skeleton-block upcoming-still"></div>
          <div class="info">
            <div class="watchlist-skeleton-block watchlist-skeleton-title"></div>
            <div class="watchlist-skeleton-block watchlist-skeleton-meta"></div>
          </div>
          <div class="watchlist-skeleton-block watchlist-skeleton-meta"></div>
        </div>
      </div>
      <span class="watchlist-skeleton-sr">Loading upcoming episodes…</span>
    </div>

    <template v-else-if="model.state === 'empty'">
      <div class="upcoming-group-title upcoming-group-title--notifications upcoming-notification-fallback">
        <span class="upcoming-group-title-label">UPCOMING</span>
        <a class="upcoming-notification-bell" href="/app/notifications" aria-label="Notifications">
          <img :src="model.bellIcon" alt="" aria-hidden="true" class="notification-icon notification-icon--light">
          <span class="notification-unread-dot" aria-hidden="true" :hidden="!model.unread"></span>
        </a>
      </div>
      <div class="empty-state">
        <h2>No upcoming episodes</h2>
        <p>New releases will appear here.</p>
      </div>
    </template>

    <template v-else>
      <div v-for="group in model.groups" :key="group.name" class="upcoming-group">
        <div :class="['upcoming-group-title', { 'upcoming-group-title--notifications': group.showNotificationBell }]">
          <span v-if="group.showNotificationBell" class="upcoming-group-title-label">{{ group.name }}</span>
          <template v-else>{{ group.name }}</template>
          <a v-if="group.showNotificationBell" class="upcoming-notification-bell" href="/app/notifications" aria-label="Notifications">
            <img :src="model.bellIcon" alt="" aria-hidden="true" class="notification-icon notification-icon--light">
            <span class="notification-unread-dot" aria-hidden="true" :hidden="!model.unread"></span>
          </a>
        </div>

        <div v-for="item in group.items" :key="item.key" class="show upcoming-entry-card">
          <a class="app-route-card-link" :href="item.route" :aria-label="`Open ${item.showTitle || 'show'} episode`"></a>
          <img v-if="item.imageUrl" class="upcoming-still" loading="lazy" decoding="async" :src="item.imageUrl" alt="">
          <div v-else class="upcoming-still-placeholder" aria-hidden="true">📺</div>

          <div class="info">
            <div class="title">{{ item.showTitle }}</div>
            <div class="upcoming-episode-line">{{ item.episodeLabel }}</div>
            <button v-if="item.behindText" class="upcoming-behind" type="button">{{ item.behindText }}</button>
            <button v-if="item.batchKey" class="upcoming-batch-button" :data-batch="item.batchKey">
              {{ item.batchOpen ? 'Hide episodes ▴' : `View ${item.extraEpisodes.length} more ▾` }}
            </button>
            <div v-if="item.isNew" class="new-badge">NEW</div>

            <div v-if="item.batchOpen && item.extraEpisodes.length" class="upcoming-batch-list">
              <div
                v-for="extra in item.extraEpisodes"
                :key="extra.key"
                class="upcoming-batch-row"
                :data-show="extra.showId"
                :data-season="extra.season"
                :data-episode="extra.episode"
              >
                <a class="app-route-card-link" :href="extra.route" :aria-label="`Open ${item.showTitle || 'show'} episode`"></a>
                <img v-if="extra.imageUrl" class="upcoming-batch-still" loading="lazy" decoding="async" :src="extra.imageUrl" alt="">
                <div v-else class="upcoming-batch-still-placeholder" aria-hidden="true">📺</div>
                <div class="upcoming-batch-info">
                  <div class="upcoming-batch-episode">{{ extra.label }}</div>
                  <div class="upcoming-batch-date">{{ extra.timeLabel }}</div>
                </div>
                <div
                  v-if="extra.canLog"
                  class="check upcoming-batch-check"
                  :data-show="extra.showId"
                  :data-season="extra.season"
                  :data-episode="extra.episode"
                ></div>
              </div>
            </div>
          </div>

          <div class="upcoming-time">{{ item.timeLabel }}</div>
          <div
            v-if="item.canLog"
            class="check upcoming-check"
            :data-show="item.showId"
            :data-season="item.season"
            :data-episode="item.episode"
          ></div>
        </div>
      </div>
    </template>
  </div>

  <div
    v-else
    style="display: contents"
    data-tvtracker-upcoming-notifications-owner="vue-notifications"
  >
    <div class="notifications-shell">
      <header class="notifications-header">
        <div class="notifications-title-row">
          <a class="show-page-back-button notifications-back-button" href="/app/upcoming" aria-label="Back to Upcoming">
            <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
          </a>
          <h1 class="tw-font-league">Notifications</h1>
        </div>
        <a class="notifications-settings-link" href="/app/settings/notifications" aria-label="Notification settings">
          <img :src="model.settingsIcon" alt="" aria-hidden="true" class="notification-icon notification-icon--light">
        </a>
      </header>
      <div class="notifications-list" id="notifications-list">
        <div v-if="model.state === 'loading'" class="notifications-loading">Loading notifications…</div>
        <div v-else-if="model.state === 'error'" class="notifications-empty">Notifications are temporarily unavailable.</div>
        <div v-else-if="model.state === 'empty'" class="notifications-empty">No notifications yet.</div>
        <template v-else>
          <article
            v-for="item in model.items"
            :key="item.id"
            class="notification-row"
            :data-notification-id="item.id"
          >
            <div class="notification-swipe-delete-reveal" aria-hidden="true"></div>
            <a class="notification-row-link" :href="item.route">
              <span class="notification-row-icon">
                <img :src="model.bellIcon" alt="" aria-hidden="true" class="notification-icon">
              </span>
              <span class="notification-row-copy">
                <span class="notification-row-message">{{ item.message }}</span>
                <span class="notification-row-time">{{ item.timeLabel }}</span>
              </span>
              <img v-if="item.imageUrl" class="notification-row-thumb" :src="item.imageUrl" alt="" loading="lazy">
              <span v-else class="notification-row-thumb notification-row-thumb--empty" aria-hidden="true"></span>
            </a>
            <button class="notification-row-delete" type="button" aria-label="Delete notification">Delete</button>
          </article>
        </template>
      </div>
    </div>
  </div>
</template>
