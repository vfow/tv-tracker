"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname,"..","static/css/settings-v2.css"),"utf8");

assert(css.includes(".settings-v2-header{margin-bottom:0}"),"Settings must not double-space the tab divider and first section");
assert(css.includes(".settings-v2-section{padding:28px 0 8px"),"Settings must retain comfortable section breathing room");
assert(css.includes(".settings-v2-avatar-preview{display:flex"),"Profile avatar preview must use a centering layout");
assert(css.includes(".settings-v2-avatar-preview .profile-avatar-initial{display:flex;width:100%;height:100%;align-items:center;justify-content:center"),"Profile avatar initial must be centered in the circle");
assert(css.includes('[data-tvtracker-vue-profile-settings="profile"] .settings-v2-profile-section>.settings-v2-copy:not([role="status"])'),"Profile helper copy must stay hidden while runtime status remains available");
assert(css.includes('[data-tvtracker-vue-auth-settings="auth"] .settings-v2-body>.settings-v2-section:nth-child(2)>h2'),"Auth Session heading must stay hidden");
assert(css.includes('[data-tvtracker-vue-settings="streaming"] .settings-v2-section>.settings-v2-copy'),"Streaming helper copy must stay hidden");
assert(css.includes('[data-tvtracker-vue-danger-settings="danger-zone"] .settings-v2-disabled-note:not([role="status"])'),"Danger Zone availability notes must stay hidden without suppressing runtime status");
assert(css.includes('content:"Export, import, or create a readable report of your data."'),"Data description must use the simplified wording");

console.log("Settings layout and copy cleanup regression passed.");
