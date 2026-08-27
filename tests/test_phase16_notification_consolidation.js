const fs=require("fs"),path=require("path"),assert=require("assert");
const ROOT=path.resolve(__dirname,"..");
const t=fs.readFileSync(path.join(ROOT,"templates/index.html"),"utf8");
const r=fs.readFileSync(path.join(ROOT,"static/js/notifications-runtime.js"),"utf8");
const runtime=fs.readFileSync(path.join(ROOT,"tvtracker/notifications/runtime.py"),"utf8");
const backend=fs.readFileSync(path.join(ROOT,"tvtracker/notifications/push_and_movies.py"),"utf8");
const settingsModule=fs.readFileSync(path.join(ROOT,"tvtracker/notifications/backend.py"),"utf8");
const validation=fs.readFileSync(path.join(ROOT,"tvtracker/notifications/push_validation.py"),"utf8");

function occurrences(value,needle){
    return value.split(needle).length - 1;
}

assert(t.includes("notifications-runtime.js"));
assert(!t.includes("notifications-final.js"));
assert(!t.includes("notifications-polish.js"));
assert(!t.includes("js/notifications.js"));
assert(r.includes("Movie Released"));
assert(r.includes("Push Notifications"));

// The legacy 6-family settings-page renderer is dead code: it is not referenced
// anywhere else and its entry points were removed.
assert(!r.includes("async function renderNotificationSettingsPage"),"the legacy settings-page renderer must be absent");
assert(!r.includes("const SETTINGS_OPTIONS = ["),"the legacy 6-family option list must be absent");
assert(!r.includes("notification-settings-content"),"the legacy settings page container must be absent");
assert(!r.includes("notification-settings-page"),"the legacy settings page id must be absent");

// Exactly one canonical notification settings renderer owns all rows.
assert.strictEqual(occurrences(r,"async function renderNotificationControls"),1,"there must be exactly one canonical settings renderer");
const canonicalStart = r.indexOf("async function renderNotificationControls");
const canonicalEnd = r.indexOf("function openDedicatedSettingsPage",canonicalStart);
assert(canonicalStart > 0 && canonicalEnd > canonicalStart);
const canonical = r.slice(canonicalStart,canonicalEnd);
assert(canonical.includes("list.appendChild(pushRow);"),"the Push control must come from the canonical renderer");
assert(canonical.includes("list.appendChild(masterRow);"),"the master toggle must come from the canonical renderer");
assert(canonical.includes("BASE_SETTING_OPTIONS.forEach"),"TV and movie family rows must come from the canonical renderer");
assert(canonical.includes("pushNotifications"),"the Push row must come from the canonical renderer");
const settingsOwner = r.slice(r.indexOf('const CANONICAL_SETTINGS_ROUTE = "/app/settings/notifications";'));
assert(settingsOwner.includes('["movieReleased","Movie Released"'),"movie settings rows must come from the canonical owner");
assert(settingsOwner.includes('["movieReleaseUpdates","Movie Release Updates"'),"movie release-update rows must come from the canonical owner");

// The Python runtime wrapper is a thin facade: no patching, no duplicated orchestration.
assert(!runtime.includes("_ORIGINAL_ENSURE_FINAL_SCHEMA"),"the runtime wrapper must not keep patch references");
assert(!runtime.includes("_schema_already_prepared"),"the runtime wrapper must not install no-op schema helpers");
assert(!runtime.includes("final.ensure_final_schema ="),"the runtime wrapper must not patch the canonical owner");
assert(runtime.includes("final.ensure_final_schema(connection_factory)"),"runtime preparation must delegate to the canonical schema guard");
assert(runtime.includes("final.run_final_notification_worker("),"the hardened worker must delegate to the canonical worker");
assert(occurrences(runtime,"run_final_notification_worker_hardened") === 1,"there must be exactly one hardened-worker entry point");

// The canonical owner holds every second-audit safeguard natively.
assert(backend.includes("def _prepare_push_outbox_state"),"the outbox preflight must live in the canonical owner");
assert(backend.includes("def run_final_notification_worker"),"the worker orchestration must live in the canonical owner");
assert(backend.includes("DELETE FROM tv_tracker_movie_notification_baseline"),"region-clear must live in the canonical movie runner");
assert(backend.includes("def push_config"),"the VAPID-hardened push config must live in the canonical owner");
assert(backend.includes("validate_vapid_configuration("),"the canonical push config must validate VAPID natively");
assert(!backend.includes("app.view_functions[\"notification_settings_api\"]"),"the installer must not overwrite the settings GET endpoint");
assert(!backend.includes("app.view_functions[\"notification_settings_patch_api\"]"),"the installer must not overwrite the settings PATCH endpoint");
assert(!backend.includes("app.view_functions[\"notifications_api\"]"),"the installer must not overwrite the notifications endpoint");
assert(!backend.includes("tv_tracker_final_notification_settings"),"application code must not read the retired settings table");
assert(!backend.includes("serialize_combined_settings"),"the combined-settings shim must be gone");
assert(!backend.includes("update_combined_settings"),"the combined-settings shim must be gone");
assert(!backend.includes("list_notifications_final"),"the duplicate notifications serializer must be gone");
assert(!validation.includes("harden_push_config"),"monkey-patching of push_config must be gone");
assert(settingsModule.includes('"movieReleased": "movie_released"'),"movie settings must be served by the canonical settings module");
assert(settingsModule.includes('"movieReleaseUpdates": "movie_release_updates"'),"movie settings must be served by the canonical settings module");
assert(settingsModule.includes('"movieId": media_id if media_type == "movie"'),"media-aware notifications must come from the canonical module");
assert(settingsModule.includes('f"/app/movie/{media_id}"'),"movie notifications must route to the movie page");

console.log("Phase 16 notification consolidation contracts passed.");
