from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


source_path = Path("static/css/tailwind-input.css")
source = source_path.read_text()
source = replace_once(
    source,
    ".notification-row-delete{position:absolute;right:16px;top:50%;",
    ".notification-row-delete{position:absolute;z-index:2;right:16px;top:50%;",
    "desktop notification delete z-index",
)
source_path.write_text(source)

runtime_path = Path("static/css/tailwind.css")
runtime = runtime_path.read_text().rstrip() + "\n"
runtime += r'''
/* Notification live UX runtime overrides */
.notification-live-toast-stack{position:fixed;right:max(20px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));z-index:1300;display:flex;width:min(390px,calc(100vw - 40px));flex-direction:column;gap:10px;pointer-events:none}
.notification-live-toast{position:relative;display:grid;grid-template-columns:42px minmax(0,1fr) 68px;align-items:center;gap:12px;min-height:68px;padding:10px 34px 10px 10px;border:1px solid #333;border-radius:6px;background:#111;color:#ddd;box-shadow:0 18px 50px rgba(0,0,0,.52);cursor:pointer;pointer-events:auto;animation:notificationToastIn .18s ease-out both}
.notification-live-toast:focus-visible{outline:2px solid #fff;outline-offset:3px}
.notification-live-toast-icon{display:flex;width:42px;height:42px;align-items:center;justify-content:center;border-radius:9999px;background:#fff;color:#000}
.notification-live-toast-icon .notification-icon{width:20px;height:20px}
.notification-live-toast-message{min-width:0;color:#ddd;font-size:14px;font-weight:600;line-height:1.35}
.notification-live-toast-thumb{width:68px;height:42px;border-radius:4px;background:#151515;object-fit:cover}
.notification-live-toast-close{position:absolute;right:7px;top:5px;display:inline-flex;width:24px;height:24px;align-items:center;justify-content:center;border:0;background:transparent;color:#888;font-size:21px;line-height:1;cursor:pointer;transition:color .14s ease}
.notification-live-toast-close:hover,.notification-live-toast-close:focus-visible{color:#fff}
.notification-live-toast--leaving{animation:notificationToastOut .18s ease-in both}
@keyframes notificationToastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes notificationToastOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(8px)}}
.notification-row{overflow:hidden}
.notification-swipe-delete-reveal{position:absolute;inset:0;display:none;align-items:center;justify-content:flex-end;padding-right:22px;background:radial-gradient(circle at 10% 20%, rgba(120,0,40,.45), transparent 35%),linear-gradient(135deg,#111 0%,#080808 60%,#000 100%);color:#fff;font-size:12px;font-weight:800;letter-spacing:.08em;pointer-events:none}
.notification-swipe-delete-reveal span{transition:transform .14s ease,opacity .14s ease}
.notification-row--delete-ready .notification-swipe-delete-reveal span{transform:scale(1.06);opacity:1}
.notification-row-link{position:relative;z-index:1;background:#000;transition:background-color .16s ease,transform .18s cubic-bezier(.2,.8,.2,1)}
.notification-row--swiping .notification-row-link{transition:none}
.notification-row-delete{z-index:2}
@media (pointer:coarse){.notification-row-delete{display:none}.notification-swipe-delete-reveal{display:flex}}
@media (max-width:767px){.notification-live-toast-stack{right:12px;bottom:calc(var(--tt-mobile-bottom-nav-height) + env(safe-area-inset-bottom) + 12px);width:min(360px,calc(100vw - 24px))}.notification-live-toast{grid-template-columns:40px minmax(0,1fr) 62px;min-height:64px;padding:9px 32px 9px 9px}.notification-live-toast-icon{width:40px;height:40px}.notification-live-toast-thumb{width:62px;height:40px}}
@media (prefers-reduced-motion:reduce){.notification-live-toast,.notification-live-toast--leaving{animation:none}.notification-row-link,.notification-swipe-delete-reveal span{transition:none}}
'''
runtime_path.write_text(runtime)

contract_path = Path("tests/test_notification_contract.py")
contract = contract_path.read_text()
contract = replace_once(
    contract,
    '''assert "notification-swipe-delete-reveal" in css\nassert "🗑" not in frontend and "🗑" not in css''',
    '''assert "notification-swipe-delete-reveal" in css\nassert ".notification-row-delete{position:absolute;z-index:2" in css\nassert "🗑" not in frontend and "🗑" not in css''',
    "desktop delete stacking contract",
)
contract_path.write_text(contract)
