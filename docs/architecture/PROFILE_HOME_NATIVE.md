# Native Profile home and statistics

`ProfileSurface.vue` now composes the Profile hero, saved avatar/header, favorite
show/movie slots, statistics cards and ranked genre/network lists. It reuses the
native `ProfileAvatar.vue` and `PresetAvatar.vue` introduced for Settings previews.
The replaced Profile HTML writers and their duplicated avatar SVG composer are
removed from `ui.js`.

`profile-vue-bridge.js` is the structured model and action boundary. Canonical
`getProfileStats`, favorites, History runtime calculations, network metadata
sync, route builders and favorite editor services remain authoritative. The
component does not write tracker data or issue backend requests. Stats still
starts the existing metadata sync service; its status and retry message retain
their existing meaning. The bridge uses the shared Vue loader and suppresses
late rendering after route departure. Metadata refresh updates a stable owner.

Existing behavior is preserved: eight slots per favorite kind, original favorite
order, profile navigation context, all eleven statistics, uploaded and preset
artwork, placeholders, ranked rows and empty states. Native view changes also
place keyboard focus on the back control or returning stats opener.

Regression coverage exercises the real app projection with the compiled Vue
bundle at 320, 375 and 1280 pixels. It checks History-derived counts, untouched
tracker/favorites/History, favorite action delegation, escaped text, all avatar
modes, header presentation, empty slots, sync status, focus, route departure and
overflow. Provider sync and favorite editor/navigation calls are isolated at
their existing service boundary.

The favorites editor and canvas crop dialogs retain their current owner in
`ui.js` for a separate review. This slice does not claim those or the final
whole-system/release gates are complete.
