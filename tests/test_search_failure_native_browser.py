"""Search provider failures and retry remain inside the native Vue owner."""

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


class SearchFailureNativeBrowserTests(unittest.TestCase):
    def test_native_search_failure(self):
        browser = os.environ.get("CHROME_BIN") or next(
            (path for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
             if (path := shutil.which(name))), None,
        )
        if not browser:
            if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
                self.fail("CI must provide Chrome for native Search failure acceptance")
            self.skipTest("Chrome is unavailable locally")

        fixture = r'''<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/static/css/tailwind.css"></head><body><div id="search-results"></div>
<script src="/static/js/audit-utils.js"></script><script src="/static/js/app.js"></script><script src="/static/js/ui.js"></script>
<script>
activePage='search';searchRouteState={query:'canary',media:'movie',hidePlan:true};discoverSearchState={query:'canary',media:'movie'};
DATA.history=[{id:'unknown',action:'legacy'}];let requests=[],errors=0;
window.tmdbSearchMediaBatch=(...args)=>new Promise((resolve,reject)=>requests.push({args,resolve,reject}));
window.showToast=()=>{};
window.addEventListener('unhandledrejection',event=>{errors++;event.preventDefault();});
</script><script src="/static/js/search-state-bridge.js"></script>
<script type="module">
const failures=[];const check=(ok,label)=>{if(!ok)failures.push(label);};const tick=()=>new Promise(resolve=>setTimeout(resolve,35));
try{
const truth=()=>JSON.stringify({shows:DATA.shows,movies:DATA.movies,history:DATA.history});
const before=truth();
const manifest=await(await fetch('/static/vue/manifest.json')).json();await import('/static/vue/'+manifest['frontend/src/main.ts'].file);
const first=searchShows('canary',{skipRoute:true});await tick();
check(document.querySelectorAll('.tt-skeleton-poster-card').length===12,'native loading');
requests[0].reject(Error('Synthetic provider failure private-payload'));await first;await tick();
check(document.querySelector('[data-tvtracker-search-owner="vue"] [role="alert"]').textContent.includes('Search failed'),'provider error stays in native owner');
check(!document.getElementById('search-results').textContent.includes('private-payload'),'error content is generic');
check(document.querySelectorAll('[data-tvtracker-search-owner="vue"]').length===1,'single owner');
check(!document.getElementById('search-load-more-button'),'no stale pagination on error');
const retry=Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='Try again');retry.click();await tick();
check(requests.length===2&&requests[1].args[0]==='canary'&&requests[1].args[1]==='movie','retry keeps query and media');
check(searchRouteState.hidePlan===true&&discoverSearchState.hidePlan===true,'retry keeps filters');
requests[1].resolve({results:[{id:99,title:'Recovered <b>movie</b>',media_type:'movie',release_date:'2020-01-01'}],page:1,total_pages:1});await tick();
check(document.querySelector('.search-result-poster-card').textContent.includes('Recovered <b>movie</b>')&&!document.querySelector('.search-result-poster-card b'),'retry success renders escaped results');
check(!document.querySelector('[role="alert"]'),'successful retry clears error');
check(document.documentElement.scrollWidth<=innerWidth+1,'responsive search '+innerWidth);
const pending=searchShows('later',{skipRoute:true});await tick();activePage='settings';
const current=document.getElementById('search-results').innerHTML;
requests[2].reject(Error('Late failure'));await pending;await tick();
check(document.getElementById('search-results').innerHTML===current,'late failure does not repaint another route');
activePage='search';await searchShows('',{skipRoute:true});await tick();check(document.body.textContent.includes('Start typing to search.'),'clearing query clears error');
check(truth()===before,'search never changes tracker or History');check(errors===0,'no uncaught retry failure');
}catch(error){failures.push(String(error));}
document.body.dataset.acceptance=failures.length?'failed':'ready';document.body.dataset.failures=JSON.stringify(failures);parent.postMessage({acceptance:document.body.dataset.acceptance,failures},location.origin);
</script></body></html>'''.encode()

        class Handler(SimpleHTTPRequestHandler):
            def do_GET(self):
                if self.path.startswith("/fixture/"):
                    width = int(self.path.rsplit("/", 1)[-1])
                    wrapper = ("<!doctype html><html><body><script>window.addEventListener('message',event=>{"
                               "if(event.origin!==location.origin)return;document.body.dataset.acceptance=event.data.acceptance;"
                               "document.body.dataset.failures=JSON.stringify(event.data.failures);});</script>"
                               f'<iframe src="/surface" style="width:{width}px;height:900px;border:0"></iframe></body></html>').encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(wrapper)
                elif self.path == "/surface":
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
            for width in (320, 375, 1280):
                with tempfile.TemporaryDirectory(prefix="tvtracker-episode-details-") as profile:
                    result = subprocess.run([
                        browser, "--headless=new", "--no-sandbox", "--disable-gpu",
                        "--disable-dev-shm-usage", "--disable-background-networking", "--no-proxy-server",
                        "--no-first-run", "--no-default-browser-check", "--virtual-time-budget=8000",
                        f"--user-data-dir={profile}", "--dump-dom", f"http://127.0.0.1:{server.server_port}/fixture/{width}",
                    ], capture_output=True, text=True, timeout=25, check=False)
                self.assertEqual(result.returncode, 0, result.stderr[-2000:])
                self.assertIn('data-acceptance="ready"', result.stdout, result.stdout[-4000:])
                self.assertIn('data-failures="[]"', result.stdout)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
