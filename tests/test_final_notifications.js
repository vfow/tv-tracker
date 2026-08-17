const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname,"..");
const source = fs.readFileSync(path.join(ROOT,"static/js/notifications-final.js"),"utf8");
const backend = fs.readFileSync(path.join(ROOT,"final_notifications.py"),"utf8");
const worker = fs.readFileSync(path.join(ROOT,"notification_worker.py"),"utf8");
const wsgi = fs.readFileSync(path.join(ROOT,"wsgi.py"),"utf8");
const deploy = fs.readFileSync(path.join(ROOT,".github/workflows/deploy.yml"),"utf8");

assert(source.includes('"Movie Released"'));
assert(source.includes('"Movie Release Updates"'));
assert(source.includes('"Push Notifications"'));
assert(source.includes('NotificationApi.requestPermission()'));
assert(source.includes('pushManager.subscribe'));
assert(source.includes('pushManager.getSubscription'));
assert(source.includes('subscription.unsubscribe()'));
assert(source.includes('tvtracker-consume-push-clicks'));
assert(source.includes('tvtracker-push-clicks'));
assert(source.includes('/api/push/presence'));
assert(source.includes('dataset.intrinsicDisabled'));
assert(source.includes('notificationApi()'));
assert(source.includes('updateViaCache:"none"'));
assert(!source.includes('pushNotification='));

assert(backend.includes('MEANINGFUL_MOVIE_RELEASE_TYPES = {2, 3, 4, 6}'));
assert(backend.includes('return f"movie:{movie_id}:{region}:released"'));
assert(backend.includes('silent_release_claim'));
assert(backend.includes("tv_tracker_movie_notification_baseline"));
assert(backend.includes("tv_tracker_push_subscriptions"));
assert(backend.includes("tv_tracker_push_presence"));
assert(backend.includes("tv_tracker_push_deliveries"));
assert(backend.includes("session_version BIGINT NOT NULL DEFAULT 0"));
assert(backend.includes("media_type TEXT NOT NULL DEFAULT 'tv'"));
assert(backend.includes('f"/app/movie/{movie_id}"'));
assert(backend.includes("MAX_PUSHES_PER_BATCH = 3"));
assert(backend.includes("PUSH_ACTIVE_WINDOW_SECONDS = 75"));
assert(backend.includes("PUSH_REQUEST_TIMEOUT_SECONDS = 10"));
assert(backend.includes("timeout=PUSH_REQUEST_TIMEOUT_SECONDS"));
assert(backend.includes("FOR UPDATE OF d SKIP LOCKED"));
assert(backend.includes("PUSH_DELIVERY_RETENTION_DAYS = 30"));
assert(backend.includes("ON CONFLICT (delivery_key) DO NOTHING"));
assert(backend.includes("status_code in {404, 410}"));
assert(backend.includes("VAPID_PRIVATE_KEY"));
assert(backend.includes("VAPID_PUBLIC_KEY"));
assert(backend.includes("VAPID_SUBJECT"));
assert(backend.includes("_best_effort"));
assert(backend.includes("PUSH_DEVICE_COOKIE"));
assert(!backend.toLowerCase().includes('notification_type="renewed"'));
assert(!backend.includes('event_type, "renewed"'));

const swStart = backend.indexOf("def _service_worker_source");
const swEnd = backend.indexOf("def _best_effort",swStart);
const swSource = backend.slice(swStart,swEnd);
assert(swSource.includes('addEventListener("push"'));
assert(swSource.includes('addEventListener("notificationclick"'));
assert(swSource.includes('showNotification'));
assert(swSource.includes('indexedDB.open'));
assert(!swSource.includes('visibilityState'));
assert(!swSource.includes('addEventListener("fetch"'));

assert(worker.includes("run_final_notification_worker"));
assert(wsgi.includes("install_final_notifications"));
assert(deploy.includes('pip install $PIP_SCOPE -r requirements.txt'));
assert(deploy.includes('import pywebpush'));

console.log("Final notifications browser/source contracts passed.");
