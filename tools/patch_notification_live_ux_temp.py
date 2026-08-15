from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# Backend: expose a single-notification read operation and lightweight latest version metadata.
backend_path = Path("notifications_backend.py")
backend = backend_path.read_text()
backend = replace_once(
    backend,
    '''def mark_all_notifications_read(connection_factory: Callable[[], Any]) -> int:\n    with connection_factory() as connection:\n        with connection.cursor() as cursor:\n            cursor.execute(\n                "UPDATE tv_tracker_notifications SET is_read = TRUE, updated_at = NOW() "\n                "WHERE is_read = FALSE"\n            )\n            changed = int(cursor.rowcount or 0)\n        connection.commit()\n    return changed\n\n\ndef delete_notification''',
    '''def mark_all_notifications_read(connection_factory: Callable[[], Any]) -> int:\n    with connection_factory() as connection:\n        with connection.cursor() as cursor:\n            cursor.execute(\n                "UPDATE tv_tracker_notifications SET is_read = TRUE, updated_at = NOW() "\n                "WHERE is_read = FALSE"\n            )\n            changed = int(cursor.rowcount or 0)\n        connection.commit()\n    return changed\n\n\ndef mark_notification_read(\n    connection_factory: Callable[[], Any],\n    notification_id: int,\n) -> bool:\n    with connection_factory() as connection:\n        with connection.cursor() as cursor:\n            cursor.execute(\n                "UPDATE tv_tracker_notifications SET is_read = TRUE, updated_at = NOW() "\n                "WHERE notification_id = %s",\n                (int(notification_id),),\n            )\n            changed = int(cursor.rowcount or 0) > 0\n        connection.commit()\n    return changed\n\n\ndef delete_notification''',
    "single notification read backend",
)
backend = replace_once(
    backend,
    '''            cursor.execute(\n                "SELECT EXISTS(SELECT 1 FROM tv_tracker_notifications WHERE is_read = FALSE)"\n            )\n            row = cursor.fetchone()\n            unread = bool(row and row[0])\n    return {\n        "unread": unread,\n        "timezone": str(settings.get("timezone") or ""),\n        "enabled": bool(settings.get("enabled", True)),\n    }''',
    '''            cursor.execute(\n                "SELECT EXISTS(SELECT 1 FROM tv_tracker_notifications WHERE is_read = FALSE)"\n            )\n            row = cursor.fetchone()\n            unread = bool(row and row[0])\n            cursor.execute(\n                "SELECT notification_id, created_at FROM tv_tracker_notifications "\n                "ORDER BY created_at DESC, notification_id DESC LIMIT 1"\n            )\n            latest = cursor.fetchone()\n    return {\n        "unread": unread,\n        "timezone": str(settings.get("timezone") or ""),\n        "enabled": bool(settings.get("enabled", True)),\n        "latestId": int(latest[0]) if latest else 0,\n        "latestCreatedAt": latest[1].isoformat() if latest and latest[1] else "",\n    }''',
    "notification status latest version",
)
backend_path.write_text(backend)


# Flask route for marking only the toast-clicked notification as read.
app_path = Path("app.py")
app = app_path.read_text()
app = replace_once(
    app,
    '''    mark_all_notifications_read as mark_notifications_read,\n    notification_status as get_notification_status,''',
    '''    mark_all_notifications_read as mark_notifications_read,\n    mark_notification_read as mark_notification_read_record,\n    notification_status as get_notification_status,''',
    "notification read import",
)
app = replace_once(
    app,
    '''    @app.delete("/api/notifications/<int:notification_id>")\n    @login_required\n    def notification_delete_api(notification_id: int):''',
    '''    @app.post("/api/notifications/<int:notification_id>/read")\n    @login_required\n    def notification_read_api(notification_id: int):\n        check_csrf()\n        if notification_id <= 0 or not mark_notification_read_record(\n            database_connection, notification_id\n        ):\n            return jsonify({\n                "ok": False,\n                "error": "Notification not found",\n            }), 404\n        return jsonify({"ok": True})\n\n    @app.delete("/api/notifications/<int:notification_id>")\n    @login_required\n    def notification_delete_api(notification_id: int):''',
    "notification read route",
)
app_path.write_text(app)


# Frontend live polling, stacked toasts, and swipe reveal.
js_path = Path("static/js/notifications.js")
js = js_path.read_text()
js = replace_once(
    js,
    '''    let notificationSettings = null;\n    let statusPromise = null;\n    let timezoneBootstrapAttempted = false;''',
    '''    let notificationSettings = null;\n    let statusPromise = null;\n    let timezoneBootstrapAttempted = false;\n    const LIVE_NOTIFICATION_POLL_MS = 30 * 1000;\n    const LIVE_NOTIFICATION_TOAST_MS = 5 * 1000;\n    const MAX_VISIBLE_NOTIFICATION_TOASTS = 3;\n    const liveNotificationVersions = new Map();\n    const liveToastQueue = [];\n    const liveToastKeys = new Set();\n    let liveNotificationLatestVersion = "";\n    let liveNotificationBootstrapped = false;\n    let liveNotificationPollTimer = null;\n    let liveNotificationPollBusy = false;\n    let visibleNotificationToasts = 0;''',
    "live notification state",
)

old_delete = '''    async function deleteNotification(id,row){\n        if(!id){ return; }\n        try{\n            await requestJSON("/api/notifications/" + encodeURIComponent(String(id)),{method:"DELETE"});\n            if(row){\n                row.classList.add("notification-row--removing");\n                window.setTimeout(()=>row.remove(),180);\n            }\n        }catch(error){\n            console.error("TV Tracker could not delete notification",error);\n        }\n    }'''
new_delete = '''    async function deleteNotification(id,row){\n        if(!id){ return false; }\n        try{\n            await requestJSON("/api/notifications/" + encodeURIComponent(String(id)),{method:"DELETE"});\n            if(row){\n                row.classList.add("notification-row--removing");\n                window.setTimeout(()=>row.remove(),180);\n            }\n            return true;\n        }catch(error){\n            console.error("TV Tracker could not delete notification",error);\n            return false;\n        }\n    }'''
js = replace_once(js, old_delete, new_delete, "delete notification result")

old_swipe = '''    function bindSwipeDelete(row,id){\n        if(!row || !global.PointerEvent){ return; }\n        let startX = 0;\n        let startY = 0;\n        let deltaX = 0;\n        let active = false;\n        let horizontal = false;\n\n        row.addEventListener("pointerdown",event=>{\n            if(event.pointerType === "mouse" || event.button !== 0){ return; }\n            startX = event.clientX;\n            startY = event.clientY;\n            deltaX = 0;\n            active = true;\n            horizontal = false;\n        });\n        row.addEventListener("pointermove",event=>{\n            if(!active){ return; }\n            const dx = event.clientX - startX;\n            const dy = event.clientY - startY;\n            if(!horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)){\n                horizontal = true;\n            }\n            if(!horizontal){ return; }\n            deltaX = Math.min(0,Math.max(-110,dx));\n            row.style.transform = "translateX(" + deltaX + "px)";\n        });\n        const finish = ()=>{\n            if(!active){ return; }\n            active = false;\n            row.style.transform = "";\n            if(horizontal && deltaX <= -72){\n                deleteNotification(id,row);\n            }\n        };\n        row.addEventListener("pointerup",finish);\n        row.addEventListener("pointercancel",finish);\n    }'''
new_swipe = '''    function bindSwipeDelete(row,id,link){\n        if(!row || !link || !global.PointerEvent){ return; }\n        let startX = 0;\n        let startY = 0;\n        let deltaX = 0;\n        let active = false;\n        let horizontal = false;\n        let pointerId = null;\n        let suppressClickUntil = 0;\n\n        link.addEventListener("click",event=>{\n            if(Date.now() < suppressClickUntil){\n                event.preventDefault();\n                event.stopPropagation();\n            }\n        },true);\n\n        row.addEventListener("pointerdown",event=>{\n            if(event.pointerType === "mouse" || event.button !== 0){ return; }\n            startX = event.clientX;\n            startY = event.clientY;\n            deltaX = 0;\n            active = true;\n            horizontal = false;\n            pointerId = event.pointerId;\n            row.classList.remove("notification-row--delete-ready");\n        });\n        row.addEventListener("pointermove",event=>{\n            if(!active || (pointerId !== null && event.pointerId !== pointerId)){ return; }\n            const dx = event.clientX - startX;\n            const dy = event.clientY - startY;\n            if(!horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)){\n                horizontal = true;\n                row.classList.add("notification-row--swiping");\n                if(typeof row.setPointerCapture === "function"){\n                    try{ row.setPointerCapture(event.pointerId); }catch(error){}\n                }\n            }\n            if(!horizontal){ return; }\n            deltaX = Math.min(0,Math.max(-120,dx));\n            link.style.transform = "translateX(" + deltaX + "px)";\n            row.classList.toggle("notification-row--delete-ready",deltaX <= -72);\n        });\n        const finish = async allowDelete=>{\n            if(!active){ return; }\n            active = false;\n            pointerId = null;\n            if(horizontal && Math.abs(deltaX) > 8){\n                suppressClickUntil = Date.now() + 450;\n            }\n            const shouldDelete = !!allowDelete && horizontal && deltaX <= -72;\n            row.classList.remove("notification-row--swiping");\n            if(shouldDelete){\n                link.style.transform = "translateX(-120px)";\n                const deleted = await deleteNotification(id,row);\n                if(!deleted && row.isConnected){\n                    link.style.transform = "";\n                    row.classList.remove("notification-row--delete-ready");\n                }\n                return;\n            }\n            link.style.transform = "";\n            row.classList.remove("notification-row--delete-ready");\n        };\n        row.addEventListener("pointerup",()=>finish(true));\n        row.addEventListener("pointercancel",()=>finish(false));\n    }'''
js = replace_once(js, old_swipe, new_swipe, "mobile swipe delete")

js = replace_once(
    js,
    '''        row.dataset.notificationId = String(item.id || "");\n\n        const link = document.createElement("a");''',
    '''        row.dataset.notificationId = String(item.id || "");\n\n        const swipeReveal = document.createElement("div");\n        swipeReveal.className = "notification-swipe-delete-reveal";\n        swipeReveal.setAttribute("aria-hidden","true");\n        const swipeLabel = document.createElement("span");\n        swipeLabel.textContent = "DELETE";\n        swipeReveal.appendChild(swipeLabel);\n\n        const link = document.createElement("a");''',
    "swipe reveal markup",
)
js = replace_once(
    js,
    '''        row.appendChild(link);\n        row.appendChild(deleteButton);\n        bindSwipeDelete(row,item.id);''',
    '''        row.appendChild(swipeReveal);\n        row.appendChild(link);\n        row.appendChild(deleteButton);\n        bindSwipeDelete(row,item.id,link);''',
    "swipe reveal mount",
)

live_functions = r'''
    function notificationVersion(item){
        if(!item || !item.id){ return ""; }
        return String(item.id) + ":" + String(item.createdAt || "");
    }

    function rememberNotificationVersions(items){
        (Array.isArray(items) ? items : []).forEach(item=>{
            if(item && item.id){
                liveNotificationVersions.set(String(item.id),String(item.createdAt || ""));
            }
        });
    }

    function latestVersionFromStatus(status){
        if(!status || !status.latestId){ return ""; }
        return String(status.latestId) + ":" + String(status.latestCreatedAt || "");
    }

    function isNotificationsPageActive(){
        const page = document.getElementById("notifications-page");
        return !!(page && page.classList.contains("active-page"));
    }

    async function markNotificationRead(id){
        if(!id){ return false; }
        try{
            await requestJSON("/api/notifications/" + encodeURIComponent(String(id)) + "/read",{method:"POST"});
            await loadStatus(true);
            return true;
        }catch(error){
            console.warn("TV Tracker could not mark notification read",error);
            return false;
        }
    }

    function navigateToNotification(item){
        const route = item && item.route ? String(item.route) : "/app/upcoming";
        if(global.TVTrackerRouter && typeof global.TVTrackerRouter.setPathRoute === "function"){
            global.TVTrackerRouter.setPathRoute(route,false);
            if(typeof global.TVTrackerRouter.applyRoute === "function"){
                global.TVTrackerRouter.applyRoute();
            }
            return;
        }
        global.location.href = route;
    }

    function ensureNotificationToastStack(){
        let stack = document.getElementById("notification-live-toast-stack");
        if(stack){ return stack; }
        stack = document.createElement("div");
        stack.id = "notification-live-toast-stack";
        stack.className = "notification-live-toast-stack";
        stack.setAttribute("aria-live","polite");
        stack.setAttribute("aria-label","New notifications");
        document.body.appendChild(stack);
        return stack;
    }

    function pumpNotificationToastQueue(){
        while(visibleNotificationToasts < MAX_VISIBLE_NOTIFICATION_TOASTS && liveToastQueue.length){
            const item = liveToastQueue.shift();
            showNotificationToast(item);
        }
    }

    function enqueueNotificationToast(item){
        const key = notificationVersion(item);
        if(!key || liveToastKeys.has(key)){ return; }
        liveToastKeys.add(key);
        liveToastQueue.push(item);
        pumpNotificationToastQueue();
    }

    function showNotificationToast(item){
        const key = notificationVersion(item);
        const stack = ensureNotificationToastStack();
        const toast = document.createElement("article");
        toast.className = "notification-live-toast";
        toast.tabIndex = 0;
        toast.setAttribute("role","button");
        toast.setAttribute("aria-label",String(item.message || "Open notification"));

        const iconWrap = document.createElement("span");
        iconWrap.className = "notification-live-toast-icon";
        iconWrap.appendChild(createIconImage(BELL_ICON,"","notification-icon"));

        const message = document.createElement("span");
        message.className = "notification-live-toast-message";
        message.textContent = String(item.message || "Notification");

        toast.appendChild(iconWrap);
        toast.appendChild(message);

        const imageURL = notificationImageURL(item.imagePath);
        if(imageURL){
            const image = document.createElement("img");
            image.className = "notification-live-toast-thumb";
            image.src = imageURL;
            image.alt = "";
            image.loading = "lazy";
            toast.appendChild(image);
        }

        const close = document.createElement("button");
        close.type = "button";
        close.className = "notification-live-toast-close";
        close.setAttribute("aria-label","Dismiss notification");
        close.textContent = "×";
        toast.appendChild(close);

        let timer = null;
        let remaining = LIVE_NOTIFICATION_TOAST_MS;
        let timerStartedAt = 0;
        let dismissed = false;

        const removeToast = ()=>{
            if(dismissed){ return; }
            dismissed = true;
            if(timer){ window.clearTimeout(timer); }
            toast.classList.add("notification-live-toast--leaving");
            window.setTimeout(()=>{
                toast.remove();
                visibleNotificationToasts = Math.max(0,visibleNotificationToasts - 1);
                liveToastKeys.delete(key);
                pumpNotificationToastQueue();
            },180);
        };

        const startTimer = ()=>{
            if(dismissed || timer || remaining <= 0){ return; }
            timerStartedAt = Date.now();
            timer = window.setTimeout(()=>{
                timer = null;
                remaining = 0;
                removeToast();
            },remaining);
        };

        const pauseTimer = ()=>{
            if(!timer){ return; }
            window.clearTimeout(timer);
            timer = null;
            remaining = Math.max(0,remaining - (Date.now() - timerStartedAt));
        };

        close.addEventListener("click",event=>{
            event.preventDefault();
            event.stopPropagation();
            removeToast();
        });
        toast.addEventListener("mouseenter",pauseTimer);
        toast.addEventListener("mouseleave",startTimer);
        toast.addEventListener("focusin",pauseTimer);
        toast.addEventListener("focusout",startTimer);

        const openToast = async event=>{
            if(event && event.type === "keydown" && !["Enter"," "].includes(event.key)){ return; }
            if(event){ event.preventDefault(); }
            removeToast();
            await markNotificationRead(item.id);
            navigateToNotification(item);
        };
        toast.addEventListener("click",openToast);
        toast.addEventListener("keydown",openToast);

        visibleNotificationToasts += 1;
        stack.appendChild(toast);
        startTimer();
    }

    async function fetchNotificationItems(){
        const payload = await requestJSON("/api/notifications");
        return Array.isArray(payload.notifications) ? payload.notifications : [];
    }

    async function bootstrapLiveNotifications(){
        if(liveNotificationBootstrapped){ return; }
        try{
            const items = await fetchNotificationItems();
            rememberNotificationVersions(items);
            liveNotificationLatestVersion = items.length ? notificationVersion(items[0]) : "";
            liveNotificationBootstrapped = true;
            updateBellDots(items.some(item=>item && item.read === false));
        }catch(error){
            console.warn("TV Tracker live notification bootstrap unavailable",error);
        }
    }

    async function pollLiveNotifications(){
        if(document.hidden || liveNotificationPollBusy){ return; }
        liveNotificationPollBusy = true;
        try{
            if(!liveNotificationBootstrapped){
                await bootstrapLiveNotifications();
                return;
            }
            const status = await requestJSON("/api/notifications/status");
            await ensureTimezone(status.timezone || "");
            updateBellDots(status.unread === true);
            const latestVersion = latestVersionFromStatus(status);
            if(latestVersion === liveNotificationLatestVersion){ return; }

            const items = await fetchNotificationItems();
            const fresh = items.filter(item=>{
                if(!item || !item.id){ return false; }
                const id = String(item.id);
                return !liveNotificationVersions.has(id) || liveNotificationVersions.get(id) !== String(item.createdAt || "");
            });
            rememberNotificationVersions(items);
            liveNotificationLatestVersion = items.length ? notificationVersion(items[0]) : "";

            if(!fresh.length){ return; }
            if(isNotificationsPageActive()){
                await renderNotificationsPage();
                return;
            }

            fresh
            .filter(item=>item && item.read === false)
            .sort((a,b)=>Date.parse(a.createdAt || "") - Date.parse(b.createdAt || ""))
            .forEach(enqueueNotificationToast);
        }catch(error){
            console.warn("TV Tracker live notification check unavailable",error);
        }finally{
            liveNotificationPollBusy = false;
        }
    }

    function clearLiveNotificationPoll(){
        if(liveNotificationPollTimer){
            window.clearTimeout(liveNotificationPollTimer);
            liveNotificationPollTimer = null;
        }
    }

    function scheduleLiveNotificationPoll(delay=LIVE_NOTIFICATION_POLL_MS){
        clearLiveNotificationPoll();
        if(document.hidden){ return; }
        liveNotificationPollTimer = window.setTimeout(async()=>{
            liveNotificationPollTimer = null;
            await pollLiveNotifications();
            scheduleLiveNotificationPoll();
        },delay);
    }

    function startLiveNotifications(){
        const start = async()=>{
            await bootstrapLiveNotifications();
            scheduleLiveNotificationPoll();
        };
        if(document.readyState === "loading"){
            document.addEventListener("DOMContentLoaded",start,{once:true});
        }else{
            start();
        }
        document.addEventListener("visibilitychange",()=>{
            if(document.hidden){
                clearLiveNotificationPoll();
                return;
            }
            pollLiveNotifications().finally(()=>scheduleLiveNotificationPoll());
        });
    }
'''
js = replace_once(
    js,
    '''    function openNotificationsPage(options={}){''',
    live_functions + '''\n    function openNotificationsPage(options={}){''',
    "live notification functions",
)
js = replace_once(
    js,
    '''        _relativeTime:relativeTime\n    };\n})(window);''',
    '''        _relativeTime:relativeTime\n    };\n\n    startLiveNotifications();\n})(window);''',
    "start live notifications",
)
js_path.write_text(js)


# CSS: exact existing default header burgundy treatment for mobile swipe, plus lightweight toast stack.
css_path = Path("static/css/tailwind-input.css")
css = css_path.read_text()
css = replace_once(
    css,
    '''.notification-unread-dot{position:absolute;right:6px;top:5px;width:8px;height:8px;border-radius:9999px;background:#fff}\n.notifications-page,.notification-settings-page{background:#000}''',
    '''.notification-unread-dot{position:absolute;right:6px;top:5px;width:8px;height:8px;border-radius:9999px;background:#fff}\n.notification-live-toast-stack{position:fixed;right:max(20px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));z-index:1300;display:flex;width:min(390px,calc(100vw - 40px));flex-direction:column;gap:10px;pointer-events:none}\n.notification-live-toast{position:relative;display:grid;grid-template-columns:42px minmax(0,1fr) 68px;align-items:center;gap:12px;min-height:68px;padding:10px 34px 10px 10px;border:1px solid #333;border-radius:6px;background:#111;color:#ddd;box-shadow:0 18px 50px rgba(0,0,0,.52);cursor:pointer;pointer-events:auto;animation:notificationToastIn .18s ease-out both}\n.notification-live-toast:focus-visible{outline:2px solid #fff;outline-offset:3px}\n.notification-live-toast-icon{display:flex;width:42px;height:42px;align-items:center;justify-content:center;border-radius:9999px;background:#fff;color:#000}\n.notification-live-toast-icon .notification-icon{width:20px;height:20px}\n.notification-live-toast-message{min-width:0;color:#ddd;font-size:14px;font-weight:600;line-height:1.35}\n.notification-live-toast-thumb{width:68px;height:42px;border-radius:4px;background:#151515;object-fit:cover}\n.notification-live-toast-close{position:absolute;right:7px;top:5px;display:inline-flex;width:24px;height:24px;align-items:center;justify-content:center;border:0;background:transparent;color:#888;font-size:21px;line-height:1;cursor:pointer;transition:color .14s ease}\n.notification-live-toast-close:hover,.notification-live-toast-close:focus-visible{color:#fff}\n.notification-live-toast--leaving{animation:notificationToastOut .18s ease-in both}\n@keyframes notificationToastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}\n@keyframes notificationToastOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(8px)}}\n.notifications-page,.notification-settings-page{background:#000}''',
    "notification toast styles",
)
css = replace_once(
    css,
    '''.notification-row{position:relative;border-bottom:1px solid #171717;transition:opacity .18s ease,transform .18s ease;touch-action:pan-y}\n.notification-row-link{display:grid;grid-template-columns:48px minmax(0,1fr) 80px;align-items:center;gap:14px;min-height:74px;padding:12px 16px;color:#bdbdbd;text-decoration:none;transition:background-color .16s ease}\n.notification-row-link:hover{background:#080808}''',
    '''.notification-row{position:relative;overflow:hidden;border-bottom:1px solid #171717;transition:opacity .18s ease,transform .18s ease;touch-action:pan-y}\n.notification-swipe-delete-reveal{position:absolute;inset:0;display:none;align-items:center;justify-content:flex-end;padding-right:22px;background:radial-gradient(circle at 10% 20%, rgba(120,0,40,.45), transparent 35%),linear-gradient(135deg,#111 0%,#080808 60%,#000 100%);color:#fff;font-size:12px;font-weight:800;letter-spacing:.08em;pointer-events:none}\n.notification-swipe-delete-reveal span{transition:transform .14s ease,opacity .14s ease}\n.notification-row--delete-ready .notification-swipe-delete-reveal span{transform:scale(1.06);opacity:1}\n.notification-row-link{position:relative;z-index:1;display:grid;grid-template-columns:48px minmax(0,1fr) 80px;align-items:center;gap:14px;min-height:74px;padding:12px 16px;background:#000;color:#bdbdbd;text-decoration:none;transition:background-color .16s ease,transform .18s cubic-bezier(.2,.8,.2,1)}\n.notification-row--swiping .notification-row-link{transition:none}\n.notification-row-link:hover{background:#080808}''',
    "notification swipe styles",
)
css = replace_once(
    css,
    '''@media (pointer:coarse){.notification-row-delete{display:none}}''',
    '''@media (pointer:coarse){.notification-row-delete{display:none}.notification-swipe-delete-reveal{display:flex}}''',
    "coarse swipe reveal",
)
css = replace_once(
    css,
    '''  .notifications-header h1{font-size:48px}\n  .notification-row-link{grid-template-columns:44px minmax(0,1fr) 72px;gap:12px;min-height:70px;padding:11px 6px}''',
    '''  .notifications-header h1{font-size:48px}\n  .notification-live-toast-stack{right:12px;bottom:calc(var(--tt-mobile-bottom-nav-height) + env(safe-area-inset-bottom) + 12px);width:min(360px,calc(100vw - 24px))}\n  .notification-live-toast{grid-template-columns:40px minmax(0,1fr) 62px;min-height:64px;padding:9px 32px 9px 9px}\n  .notification-live-toast-icon{width:40px;height:40px}\n  .notification-live-toast-thumb{width:62px;height:40px}\n  .notification-row-link{grid-template-columns:44px minmax(0,1fr) 72px;gap:12px;min-height:70px;padding:11px 6px}''',
    "mobile toast styles",
)
css = replace_once(
    css,
    '''  .upcoming-notification-bell{width:36px;height:36px;flex-basis:36px}\n}\n''',
    '''  .upcoming-notification-bell{width:36px;height:36px;flex-basis:36px}\n}\n@media (prefers-reduced-motion:reduce){.notification-live-toast,.notification-live-toast--leaving{animation:none}.notification-row-link,.notification-swipe-delete-reveal span{transition:none}}\n''',
    "notification reduced motion",
)
css_path.write_text(css)


# Contract coverage for the new route, live behavior, exact burgundy reuse, and no trash icon.
test_path = Path("tests/test_notification_contract.py")
test = test_path.read_text()
test = replace_once(
    test,
    '''    "/api/notifications/read-all",\n    "/api/notifications/settings",''',
    '''    "/api/notifications/read-all",\n    "/api/notifications/<int:notification_id>/read",\n    "/api/notifications/settings",''',
    "notification read route contract",
)
test = replace_once(
    test,
    '''assert ".notifications-back-button.show-page-back-button" in css\nassert ".notification-setting-description" in css''',
    '''assert ".notifications-back-button.show-page-back-button" in css\nassert ".notification-setting-description" in css\nassert "mark_notification_read" in backend\nassert '"latestId"' in backend and '"latestCreatedAt"' in backend\nassert "LIVE_NOTIFICATION_POLL_MS = 30 * 1000" in frontend\nassert "LIVE_NOTIFICATION_TOAST_MS = 5 * 1000" in frontend\nassert "MAX_VISIBLE_NOTIFICATION_TOASTS = 3" in frontend\nassert 'document.addEventListener("visibilitychange"' in frontend\nassert 'toast.addEventListener("mouseenter",pauseTimer)' in frontend\nassert 'close.textContent = "×"' in frontend\nassert 'swipeLabel.textContent = "DELETE"' in frontend\nassert "notification-swipe-delete-reveal" in frontend\nassert "notification-live-toast-stack" in css\nassert "notification-swipe-delete-reveal" in css\nassert "🗑" not in frontend and "🗑" not in css\nassert "radial-gradient(circle at 10% 20%, rgba(120,0,40,.45), transparent 35%),linear-gradient(135deg,#111 0%,#080808 60%,#000 100%)" in css''',
    "live UX contract assertions",
)
test = replace_once(
    test,
    '''for forbidden in ("gradient", "tt-blue", "tt-gold", "#ff0000", "#00ff00"):\n    assert forbidden not in notification_css.lower()''',
    '''for forbidden in ("tt-blue", "tt-gold", "#ff0000", "#00ff00"):\n    assert forbidden not in notification_css.lower()''',
    "notification color contract",
)
test_path.write_text(test)


# Small unit test for the single-notification read helper without a real database.
Path("tests/test_notification_backend_unit.py").write_text('''import unittest\n\nfrom notifications_backend import mark_notification_read\n\n\nclass FakeCursor:\n    def __init__(self, rowcount):\n        self.rowcount = rowcount\n        self.calls = []\n\n    def __enter__(self):\n        return self\n\n    def __exit__(self, exc_type, exc, tb):\n        return False\n\n    def execute(self, query, params=None):\n        self.calls.append((query, params))\n\n\nclass FakeConnection:\n    def __init__(self, rowcount):\n        self.cursor_instance = FakeCursor(rowcount)\n        self.commits = 0\n\n    def __enter__(self):\n        return self\n\n    def __exit__(self, exc_type, exc, tb):\n        return False\n\n    def cursor(self):\n        return self.cursor_instance\n\n    def commit(self):\n        self.commits += 1\n\n\nclass NotificationBackendUnitTests(unittest.TestCase):\n    def test_mark_notification_read_updates_one_row(self):\n        connection = FakeConnection(1)\n        changed = mark_notification_read(lambda: connection, 42)\n        self.assertTrue(changed)\n        self.assertEqual(connection.commits, 1)\n        query, params = connection.cursor_instance.calls[0]\n        self.assertIn("is_read = TRUE", query)\n        self.assertEqual(params, (42,))\n\n    def test_mark_notification_read_returns_false_for_missing_row(self):\n        connection = FakeConnection(0)\n        self.assertFalse(mark_notification_read(lambda: connection, 999))\n        self.assertEqual(connection.commits, 1)\n\n\nif __name__ == "__main__":\n    unittest.main()\n''')
