"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname,"..","static/css/settings-v2.css"),"utf8");
const dataSource = fs.readFileSync(path.join(__dirname,"..","frontend/src/settings/SettingsData.vue"),"utf8");

assert(css.includes(".settings-v2{width:min(860px,calc(100% - 48px));margin:0 auto;padding:32px 0 48px"),"Desktop Settings shell must use balanced outer whitespace");
assert(css.includes(".settings-v2-header{margin-bottom:0}"),"Settings must not double-space the tab divider and first section");
assert(css.includes(".settings-v2-body{min-height:0}"),"Short Settings tabs must not force artificial page height or scrolling");
assert(css.includes(".settings-v2-section{padding:24px 0 8px"),"Settings must retain comfortable but tighter section breathing room");
assert(css.includes(".settings-v2-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))"),"Data summary must make equal room for Shows, Movies, History, and Favorites");
assert(css.includes("padding:24px 0 40px"),"Mobile Settings shell must avoid unnecessary vertical padding");
assert(css.includes(".settings-v2-summary{grid-template-columns:repeat(2,minmax(0,1fr))}"),"Mobile Data summary must remain compact without horizontal overflow");
assert(css.includes(".settings-v2-avatar-preview{display:flex"),"Profile avatar preview must use a centering layout");
assert(css.includes(".settings-v2-avatar-preview .profile-avatar-initial{display:flex;width:100%;height:100%;align-items:center;justify-content:center"),"Profile avatar initial must be centered in the circle");
assert(css.includes('[data-tvtracker-vue-profile-settings="profile"] .settings-v2-profile-section>.settings-v2-copy:not([role="status"])'),"Profile helper copy must stay hidden while runtime status remains available");
assert(css.includes('[data-tvtracker-vue-auth-settings="auth"] .settings-v2-body>.settings-v2-section:nth-child(2)>h2'),"Auth Session heading must stay hidden");
assert(css.includes('[data-tvtracker-vue-settings="streaming"] .settings-v2-section>.settings-v2-copy'),"Streaming helper copy must stay hidden");
assert(css.includes('[data-tvtracker-vue-danger-settings="danger-zone"] .settings-v2-disabled-note:not([role="status"])'),"Danger Zone availability notes must stay hidden without suppressing runtime status");

assert(dataSource.includes("Export, import, or create a readable report of your data."),"Data description must use the simplified wording in the Vue source");
assert(dataSource.includes("<div><span>Movies</span><strong>{{ formattedSummary.movies }}</strong></div>"),"Data summary must expose a Movies count beside Shows");
assert(dataSource.includes("Object.keys((window as TrackerDataWindow).DATA?.movies ?? {}).length"),"Movies count must reflect the tracked movie library");

console.log("Settings layout, copy, and movie summary regression passed.");
