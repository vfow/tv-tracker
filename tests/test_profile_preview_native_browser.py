"""Native Profile previews share the crop draft and preserve save acknowledgement."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ProfilePreviewNativeBrowserTests(unittest.TestCase):
    def test_native_profile_previews_and_crop_draft(self):
        browser = os.environ.get("CHROME_BIN") or next(
            (path for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
             if (path := shutil.which(name))), None,
        )
        if not browser:
            if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
                self.fail("CI must provide Chrome for native Profile preview acceptance")
            self.skipTest("Chrome is unavailable locally")

        fixture = r'''<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/static/css/tailwind.css">
<link rel="stylesheet" href="/static/css/settings-v2.css">
</head><body><div id="settings-content"></div>
<script src="/static/js/app.js"></script><script src="/static/js/ui.js"></script>
<script>
window.DATA.profile={username:'Original',avatar_type:'initial',avatar_preset:'silhouette-1',avatar_data:'',header_type:'preset',header_preset:'default',header_image:'',adult_filter:true};
let owner,resolveSave,rejectSave,saves=0,successes=0,errors=0,saved;
window.TVTrackerSettingsBridge={attachVueOwner(value){owner=value;value.render('profile');}};
window.TVTrackerFeedback={notify(message,options){if(options?.severity==='success')successes++;},reportError(){errors++;}};
window.saveProfileSettings=draft=>{saves++;saved=JSON.parse(JSON.stringify(draft));return new Promise((resolve,reject)=>{resolveSave=resolve;rejectSave=reject;});};
window.TVTrackerAdultPolicy={refresh(){}};
</script><script type="module">
const failures=[];
const check=(ok,label)=>{if(!ok)failures.push(label);};
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
const avatar=()=>document.getElementById('settings-avatar-preview');
const header=()=>document.getElementById('profile-header-preview-wrap');
const button=selector=>document.querySelector(selector);
try{
const manifest=await (await fetch('/static/vue/manifest.json')).json();
await import('/static/vue/'+manifest['frontend/src/main.ts'].file);
await tick();
check(avatar().textContent==='O','initial preview');
const input=document.getElementById('profile-username-input');
input.value='<b>Alice</b>';input.dispatchEvent(new Event('input',{bubbles:true}));await tick();
check(avatar().textContent==='B','existing ASCII initial policy');
check(header().textContent.includes('<b>Alice</b>')&&!header().querySelector('b'),'username is text, never markup');
for(const preset of ['silhouette-1','silhouette-2','silhouette-3','silhouette-4']){
const choice=button(`[data-avatar-preset="${preset}"]`);choice.click();await tick();
check(choice.getAttribute('aria-pressed')==='true',preset+' selected');
check(!!avatar().querySelector('svg')&&!!header().querySelector('svg'),preset+' in both previews');
}
button('[data-profile-header-preset="purple"]').click();await tick();
check(!!header().querySelector('.profile-header-purple'),'header preset');
// Crop services mutate this exact draft after asynchronous canvas completion.
// The Vue owner must react without an imperative preview renderer or remount.
const draft=window.profileSettingsDraft;
draft.avatar_type='upload';draft.avatar_data='data:image/webp;base64,UklGRg==';
draft.header_type='upload';draft.header_image='data:image/webp;base64,UklGRg==';await tick();
check(avatar().querySelector('img')?.getAttribute('src')===draft.avatar_data,'crop avatar update');
check(header().querySelector('.profile-header-image-layer img')?.getAttribute('src')===draft.header_image,'crop header update');
check(header().querySelector('.settings-header-mini-avatar img')?.getAttribute('src')===draft.avatar_data,'crop mini avatar update');
button('#remove-profile-avatar').click();button('#remove-profile-header').click();await tick();
check(avatar().textContent==='B'&&!avatar().querySelector('img'),'remove avatar');
check(!!header().querySelector('.profile-header-default')&&!header().querySelector('.profile-header-image-layer'),'remove header');
const save=button('#save-profile-settings');save.click();await tick();
check(saves===1&&save.disabled&&successes===0,'save remains pending before acknowledgement');
check(saved.username==='<b>Alice</b>'&&saved.header_type==='preset','canonical save receives draft');
resolveSave({ok:true});await tick();
check(!save.disabled&&successes===1,'acknowledged save feedback');
const adult=button('#adult-filter-input');adult.click();save.click();await tick();
rejectSave(new Error('Synthetic save rejection'));await tick();
check(errors===1&&successes===1&&!save.disabled,'rejected save is not success');
check(adult.checked&&window.DATA.profile.adult_filter===true,'adult filter failure rollback');
check(typeof window.updateProfileSettingsPreview==='undefined','legacy preview writer removed');
check(document.querySelectorAll('#settings-avatar-preview').length===1,'single preview owner');
owner.unmount();owner.render('profile');await tick();
check(avatar().textContent==='O','remount uses saved state, not abandoned draft');
}catch(error){failures.push(String(error));}
document.body.dataset.acceptance=failures.length?'failed':'ready';document.body.dataset.failures=JSON.stringify(failures);
</script></body></html>'''.encode()

        class Handler(SimpleHTTPRequestHandler):
            def do_GET(self):
                if self.path == "/fixture":
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(fixture)
                else:
                    super().do_GET()

            def log_message(self, *_args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=str(ROOT)))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(prefix="tvtracker-profile-preview-") as profile:
                result = subprocess.run([
                    browser, "--headless=new", "--no-sandbox", "--disable-gpu",
                    "--disable-dev-shm-usage", "--disable-background-networking", "--no-proxy-server",
                    "--no-first-run", "--no-default-browser-check", "--virtual-time-budget=8000",
                    f"--user-data-dir={profile}", "--dump-dom", f"http://127.0.0.1:{server.server_port}/fixture",
                ], capture_output=True, text=True, timeout=25, check=False)
            self.assertEqual(result.returncode, 0, result.stderr[-2000:])
            self.assertIn('data-acceptance="ready"', result.stdout, result.stdout[-4000:])
            self.assertIn('data-failures="[]"', result.stdout)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
