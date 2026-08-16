const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname,"..");
const source = fs.readFileSync(path.join(ROOT,"static/js/notifications-final.js"),"utf8");
const backend = fs.readFileSync(path.join(ROOT,"final_notifications.py"),"utf8");
const worker = fs.readFileSync(path.join(ROOT,"notification_worker.py"),"utf8");
const wsgi = fs.readFileSync(path.join(ROOT,"wsgi.py"),"utf8");

assert(source.includes('"Movie Released"'));
assert(source.includes('"Movie Release Updates"'));
assert(source.includes('"Push Notifications"'));
assert(source.includes('Notification.requestPermission()'));
assert(source.includes('pushManager.subscribe'));
assert(source.includes('pushManager.getSubscription'));
assert(source.includes('subscription.unsubscribe()'));
assert(source.includes('pushNotification'));
assert(source.includes('document.dispatchEvent(new Event("visibilitychange"))'));
assert(source.includes('updateViaCache:"none"'));

assert(backend.includes('MEANINGFUL_MOVIE_RELEASE_TYPES = {2, 3, 4, 6}'));
assert(backend.includes("tv_tracker_movie_notification_baseline"));
assert(backend.includes("tv_tracker_push_subscriptions"));
assert(backend.includes("tv_tracker_push_deliveries"));
assert(backend.includes("media_type TEXT NOT NULL DEFAULT 'tv'"));
assert(backend.includes('f"/app/movie/{movie_id}"'));
assert(backend.includes("MAX_PUSHES_PER_BATCH = 3"));
assert(backend.includes("ON CONFLICT (delivery_key) DO NOTHING"));
assert(backend.includes("status_code in {404, 410}"));
assert(backend.includes("VAPID_PRIVATE_KEY"));
assert(backend.includes("VAPID_PUBLIC_KEY"));
assert(backend.includes("VAPID_SUBJECT"));
assert(!backend.toLowerCase().includes('notification_type="renewed"'));
assert(!backend.includes('event_type, "renewed"'));

const swStart = backend.indexOf("def _service_worker_source");
const swEnd = backend.indexOf("def install_final_notifications",swStart);
const swSource = backend.slice(swStart,swEnd);
assert(swSource.includes('addEventListener(\\"push\\"'));
assert(swSource.includes('addEventListener(\\"notificationclick\\"'));
assert(!swSource.includes('addEventListener(\\"fetch\\"'));

assert(worker.includes("run_final_notification_worker"));
assert(wsgi.includes("install_final_notifications"));

console.log("Final notifications browser/source contracts passed.");
