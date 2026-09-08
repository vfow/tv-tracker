"""Native Streaming Settings preserve service failures, keyboard access and durable saves."""

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


class StreamingNativeBrowserTests(unittest.TestCase):
    def test_native_streaming_service_acceptance(self):
        browser = os.environ.get("CHROME_BIN") or next(
            (path for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
             if (path := shutil.which(name))), None,
        )
        if not browser:
            if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
                self.fail("CI must provide Chrome for native Streaming acceptance")
            self.skipTest("Chrome is unavailable locally")

        fixture = r'''<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/static/css/tailwind.css">
<link rel="stylesheet" href="/static/css/settings-v2.css">
</head><body><div id="settings-content"></div>
<script>
window.DATA={profile:{streaming_region:'US'}};
window.browseOptionState={countries:[],providers:{tv:[1],movie:[2]},loaded:{tvProviders:true,movieProviders:true}};
let owner,resolveSave,rejectSave,saves=0,successes=0,errors=0,reports=[];
window.TVTrackerSettingsBridge={attachVueOwner(value){owner=value;value.render('streaming');}};
window.TVTrackerFeedback={notify(message,options){if(options?.severity==='success')successes++;},reportError(){errors++;}};
window.TVTrackerClientRuntime={report:details=>reports.push(details)};
let countryAttempts=0;
window.tmdbFetchJSON=async()=>{if(++countryAttempts===1)throw Error('Synthetic country outage');return [{iso_3166_1:'US',english_name:'United States'},{iso_3166_1:'MY',english_name:'Malaysia'}];};
window.saveData=options=>{saves++;return new Promise((resolve,reject)=>{resolveSave=resolve;rejectSave=reject;});};
</script><script src="/static/js/streaming-region.js"></script><script type="module">
const failures=[];
const check=(ok,label)=>{if(!ok)failures.push(label);};
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
const input=()=>document.getElementById('settings-vue-region-input');
const menu=()=>document.getElementById('settings-vue-region-menu');
const key=value=>input().dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));
const button=text=>Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()===text);
try{
const manifest=await (await fetch('/static/vue/manifest.json')).json();
await import('/static/vue/'+manifest['frontend/src/main.ts'].file);await tick();
check(reports.some(item=>item.code==='streaming_countries_failed'),'provider error reaches privacy-safe report');
check(document.body.textContent.includes('Country list is temporarily unavailable.'),'country failure message');
input().click();await tick();
check(countryAttempts===2&&!menu().hidden,'opening retries failed country request');
input().value='mal';input().dispatchEvent(new Event('input',{bubbles:true}));await tick();
check(menu().textContent.includes('Malaysia')&&!menu().textContent.includes('United States'),'country filtering');
key('ArrowDown');await tick();
check(!!input().getAttribute('aria-activedescendant'),'keyboard active option announced');
key('Enter');await tick();
check(input().value==='Malaysia'&&menu().hidden,'keyboard selection');
check(window.DATA.profile.streaming_region==='US','selection is draft only');
button('Save Region').click();await tick();
check(saves===1&&successes===0&&button('Saving…').disabled,'no success before durable acknowledgement');
resolveSave({ok:true});await tick();
check(successes===1&&window.DATA.profile.streaming_region==='MY','acknowledged region saved');
check(window.browseOptionState.providers.tv.length===0,'provider cache invalidated after success');
button('Clear Region').click();await tick();
check(input().value==='','clear selection');
button('Save Region').click();await tick();rejectSave(Error('Synthetic save rejection'));await tick();
check(errors===1&&successes===1&&window.DATA.profile.streaming_region==='MY','failed save restores region without success');
check(input().value==='Malaysia','failed save restores visible country');
input().click();await tick();key('Escape');await tick();check(menu().hidden,'escape closes menu');
input().click();await tick();key('Tab');await tick();check(menu().hidden,'tab closes menu');
check(!document.getElementById('streaming-region-setting')&&!document.getElementById('streaming-region-picker-styles'),'no legacy rendering or styles');
check(typeof window.TVTrackerStreamingRegion.mountStreamingRegionSetting==='undefined','no legacy mount API');
owner.unmount();check(!document.querySelector('[data-tvtracker-vue-settings]'),'owner unmounted');
owner.render('streaming');await tick();check(input().value==='Malaysia','remount preserves saved region');
check(document.querySelectorAll('#settings-vue-region-input').length===1,'single input owner');
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
            with tempfile.TemporaryDirectory(prefix="tvtracker-streaming-") as profile:
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
