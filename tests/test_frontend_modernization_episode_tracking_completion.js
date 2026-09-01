const assert = require('assert');
const fs = require('fs');

const controller = fs.readFileSync('frontend/src/episode-tracking/EpisodeTrackingController.vue','utf8');
const actions = fs.readFileSync('frontend/src/episode-tracking/legacyEpisodeTrackingActions.ts','utf8');
const stateAdapter = fs.readFileSync('frontend/src/episode-tracking/legacyEpisodeTrackingState.ts','utf8');
const main = fs.readFileSync('frontend/src/main.ts','utf8');
const loader = fs.readFileSync('static/js/settings-vue-loader.js','utf8');
const ui = fs.readFileSync('static/js/ui.js','utf8');
const app = fs.readFileSync('static/js/app.js','utf8');
const watchlistRuntime = fs.readFileSync('static/js/upcoming-notifications-vue-bridge.js','utf8');

assert(controller.includes("document.addEventListener('click', handleClick, true)"), 'Vue must claim episode tracking clicks during capture before dormant legacy target listeners');
assert(controller.includes("document.removeEventListener('click', handleClick, true)"));
assert(controller.includes('event.stopImmediatePropagation()'), 'claimed episode actions must not double-fire legacy target listeners');
assert(controller.includes('[data-tvtracker-show-details-owner="vue"] .episode-check-button'));
assert(controller.includes('[data-tvtracker-show-details-owner="vue"] .season-all-button'));
assert(controller.includes('#episode-detail-content #episode-toggle-watched-button'));
assert(controller.includes("button.classList.contains('discover-preview-check-button')"), 'discover preview episode actions must retain their separate add-and-log semantics');
assert(controller.includes("button.classList.contains('discover-season-all-button')"), 'discover preview season actions must retain their separate add-and-log semantics');
assert(controller.includes('readLegacyEpisodeTrackingSnapshot()'), 'Vue interaction owner must read watched state through the immutable boundary');
assert(!controller.includes('DATA.'), 'Vue episode controller must not mutate legacy state directly');
assert(!controller.includes('saveData('), 'Vue episode controller must not own persistence');
assert(!controller.includes('fetch('), 'Vue episode controller must not own provider requests');
assert(!controller.includes('history.'), 'Vue episode controller must not own browser History');

assert(actions.includes('legacy.updateEpisodeWatched(showId, season, episode, !currentlyWatched)'), 'individual episode actions must delegate to established mutation ownership');
assert(actions.includes('legacy.markSeasonWatched(showId, season)'), 'season actions must delegate to established mutation ownership');
assert(actions.includes('legacy.markNextEpisode(showId)'), 'next-episode delegation contract must remain available');
assert(actions.includes('legacy.playCheckSuccessAnimation(element)'), 'successful watched actions must preserve the existing check animation');
assert(!actions.includes('DATA.'), 'typed action adapter must not mutate tracker state');
assert(!actions.includes('saveData('), 'typed action adapter must not own persistence');
assert(!actions.includes('/api/'), 'typed action adapter must not make API requests');

assert(main.includes("import EpisodeTrackingController from './episode-tracking/EpisodeTrackingController.vue';"));
assert(main.includes("root.id = 'vue-episode-tracking-controller-root'"));
assert(main.includes('createApp(EpisodeTrackingController)'));
assert(main.includes('mountEpisodeTrackingController();'));
assert(loader.includes('const episodeRoute = /^\\/app\\/show\\/'), 'direct canonical episode routes must load the shared Vue entry');
assert(loader.includes('if(settingsRoute || episodeRoute)'));

assert(stateAdapter.includes('readLegacyEpisodeTrackingSnapshot'), 'immutable state adapter must remain the Vue read boundary');
assert(app.includes('async function updateEpisodeWatched(showId,season,episode,isWatched)'), 'legacy individual episode mutation semantics remain authoritative');
assert(app.includes('async function markSeasonWatched(showId,seasonNumber)'), 'legacy season mutation semantics remain authoritative');
assert(app.includes('async function markNextEpisode(showId)'), 'legacy next-episode mutation semantics remain authoritative');
assert(app.includes('await confirmEpisodeUnwatch(show,season,episode);'), 'individual unwatch confirmation must remain intact');
assert(app.includes('await confirmSeasonWatch(seasonNumber);'), 'season watched confirmation must remain intact');
assert(app.includes('title:"Mark Season Unwatched"'), 'season unwatched confirmation must remain intact');
assert(app.includes('await autoCompleteShowAfterLogging(show);'), 'completion behavior must remain in established mutation flow');
assert(app.includes('reopenCompletedShowAfterUnwatch(show,season);'), 'individual episode reopen behavior must remain in legacy mutation flow');
assert(app.includes('reopenCompletedShowAfterUnwatch(show,seasonNumber)'), 'season reopen behavior must remain in legacy mutation flow');
assert(app.includes('await saveShowMutation(id,addedEntries,deletedHistoryIds);'), 'episode mutation persistence ownership must remain legacy');
assert(app.includes('isEpisodeLoggable(episodeData,show,season)'), 'future/unavailable episode blocking must remain in the mutation layer');

assert(ui.includes('document.querySelectorAll(".episode-check-button")'), 'legacy episode listener remains physically present for rollback until cleanup phase');
assert(ui.includes('document.querySelectorAll(".season-all-button")'), 'legacy season listener remains physically present for rollback until cleanup phase');
assert(ui.includes('const toggleButton = document.getElementById("episode-toggle-watched-button")'), 'legacy episode-detail listener remains physically present for rollback until cleanup phase');
assert(watchlistRuntime.includes('await global.markNextEpisode(id);'), 'Vue-native Watchlist next-episode action must continue to call the established mutation');
assert(watchlistRuntime.includes('ownership:"vue-dom"'), 'Watchlist remains a Vue-owned live DOM surface while preserving legacy mutation delegation');

console.log('Frontend modernization Episode Tracking completion parity checks passed.');
