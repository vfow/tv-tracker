# Native Profile Settings previews

Baseline: `73c31505fd343ffecb044ade7c1a965e8277bf9d` (PR #145).

The ownership audit found a genuine remaining Settings dependency: the Vue
Profile component consumed three HTML builders through `v-html`, then
`updateProfileSettingsPreview` independently replaced the same preview DOM.
The draft was not reactive, so upload/crop completion depended on that second
writer. This slice extends the existing Settings component, not the Settings
router, save pipeline or complete screen.

`SettingsProfile.vue` now shares one reactive draft with the existing crop
services. `ProfileAvatar.vue` and `PresetAvatar.vue` compose the same initial,
four preset SVGs and uploaded avatar using native Vue nodes. The existing header
markup is composed in the Settings template. Username/preset/crop changes update
both previews through Vue alone. Preset buttons expose their selected state via
`aria-pressed`; the existing classes, element IDs and appearance are preserved.

The obsolete `getProfileHeaderPreviewHTML` composer and
`updateProfileSettingsPreview` DOM writer are removed, including crop callbacks.
The crop services still update the same draft properties and retain canvas,
image format, cropping, validation and file-picker behavior. `app.js`, transport,
profile persistence, adult-filter rollback, acknowledgement and retry behavior
are unchanged. Profile home remains a separate active legacy surface and still
uses its own avatar/header display helpers; those helpers no longer feed Vue.

The new real Chrome fixture exercises initial/preset/upload/remove previews,
shared asynchronous crop-result updates, escaped username text, selection state,
pending save acknowledgement, failed-save feedback, adult-filter rollback and
unmount/remount isolation with committed production assets. Existing Settings
browser and service tests remain mandatory. The runtime absence regression
checks the two removed names across all shipped source/templates.

TypeScript, Vite, Tailwind, JavaScript regressions and source contracts are local
gates. Full CI, deployment and authenticated production checks must pass before
this slice is accepted. The whole-program ownership, torture, responsive and
final release gates remain separate.
