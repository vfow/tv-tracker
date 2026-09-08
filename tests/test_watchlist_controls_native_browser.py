"""Native Watchlist controls retain filter truth, focus and responsive layout."""

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


class WatchlistControlsNativeBrowserTests(unittest.TestCase):
    def test_native_watchlist_controls(self):
        browser = os.environ.get("CHROME_BIN") or next(
            (path for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
             if (path := shutil.which(name))), None,
        )
        if not browser:
            if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
                self.fail("CI must provide Chrome for native Watchlist controls acceptance")
            self.skipTest("Chrome is unavailable locally")

        fixture = r'''<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/static/css/tailwind.css">
</head><body><main>__FILTER_SHELL__<div id="show-list"></div></main>
<script src="/static/js/app.js"></script><script src="/static/js/ui.js"></script>
<script>
window.DATA.shows={
  11:{tmdb_id:11,title:'Beta Drama',status:'paused',genres:['Drama'],network:'BBC',first_air_date:'2024-01-01'},
  22:{tmdb_id:22,title:'Alpha Comedy',status:'paused',genres:['Comedy'],network:'FX',first_air_date:'2023-01-01'},
  33:{tmdb_id:33,title:'Other List',status:'plan',genres:['Mystery'],network:'HBO',first_air_date:'2022-01-01'}
};
window.DATA.movies={55:{id:55,title:'Movie truth',watched:true}};
window.DATA.history=[{id:'old-record',watched_at:'unknown',media_type:'unknown'}];
activePage='shows';activeShowsTab='watchlist';activeFilter='paused';
let routeUpdates=0;
window.TVTrackerRouter={updateRouteFromState(){routeUpdates++;}};
</script>
<script src="/static/js/tracker-lists-state-bridge.js"></script>
<script src="/static/js/upcoming-notifications-vue-bridge.js"></script>
<script type="module">
const failures=[];
const check=(ok,label)=>{if(!ok)failures.push(label);};
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
const cards=()=>Array.from(document.querySelectorAll('.watchlist-card')).map(el=>el.textContent);
const search=()=>document.getElementById('library-search');
const toggle=()=>document.getElementById('library-filter-toggle');
const dropdown=()=>document.getElementById('library-filter-dropdown');
const select=(id,value)=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
const type=value=>{search().value=value;search().dispatchEvent(new Event('input',{bubbles:true}));};
try{
const before=JSON.stringify({shows:DATA.shows,movies:DATA.movies,history:DATA.history});
const manifest=await (await fetch('/static/vue/manifest.json')).json();
await import('/static/vue/'+manifest['frontend/src/main.ts'].file);
await window.renderWatchlist();await tick();
check(cards().length===2,'current status entries');
check(search().placeholder==='Search Paused','status-specific search label');
check(document.getElementById('library-genre-filter').textContent.includes('Drama (1)'),'canonical option counts');
check(!document.getElementById('library-genre-filter').textContent.includes('Mystery'),'options scoped to status');
search().focus();const originalInput=search();type('Alpha');await tick();
check(cards().length===1&&cards()[0].includes('Alpha Comedy'),'search filters entries');
check(search()===originalInput&&document.activeElement===originalInput,'input and focus survive model update');
await new Promise(resolve=>setTimeout(resolve,260));check(routeUpdates===1,'existing debounced route synchronization');
type('');await tick();toggle().click();await tick();
check(!dropdown().hidden&&toggle().getAttribute('aria-expanded')==='true','filter menu opens');
select('library-genre-filter','Drama');await tick();check(cards().length===1&&cards()[0].includes('Beta Drama'),'genre filter');
check(!dropdown().hidden,'filter menu survives model update');
select('library-year-filter','2023');await tick();check(cards().length===0,'year filter intersection');
check(!document.getElementById('library-reset-filters').hidden,'reset available');
document.getElementById('library-reset-filters').click();await tick();check(cards().length===2&&activeFilter==='paused'&&dropdown().hidden,'reset preserves status and closes');
select('library-network-filter','FX');await tick();check(cards().length===1&&cards()[0].includes('Alpha Comedy'),'network filter');
window.resetLibraryFiltersToDefault();await tick();select('library-sort-mode','title-za');await tick();check(cards()[0].includes('Beta Drama'),'descending title sort');
select('library-sort-mode','title-az');await tick();check(cards()[0].includes('Alpha Comedy'),'ascending title sort');
// A route projection with a zero-count selected option must keep that selection.
libraryGenreFilter='Drama';activeFilter='plan';await window.renderWatchlist();await tick();
check(document.getElementById('library-genre-filter').value==='Drama'&&document.getElementById('library-genre-filter').textContent.includes('Drama (0)'),'zero-count option survives status route');
check(search().placeholder==='Search Plan To Watch','status route refreshes controls');
window.resetLibraryFiltersToDefault();await tick();check(cards().length===1&&cards()[0].includes('Other List'),'reset restores new status entries');
type('<img src=x onerror=alert(1)>');await tick();
check(cards().length===0&&!document.querySelector('#show-list img'),'search text is never markup');
type('');await tick();toggle().click();await tick();
const box=dropdown().getBoundingClientRect();
check(box.left>=-1&&box.right<=innerWidth+1,'filter menu fits viewport '+innerWidth);
check(document.documentElement.scrollWidth<=innerWidth+1,'no horizontal page overflow '+innerWidth);
document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();
check(dropdown().hidden&&document.activeElement===toggle(),'Escape closes and restores focus');
check(JSON.stringify({shows:DATA.shows,movies:DATA.movies,history:DATA.history})===before,'filters never mutate tracker or History truth');
check(document.querySelectorAll('#library-search').length===1&&typeof window.renderLibrarySearchControl==='undefined','one native controls owner');
}catch(error){failures.push(String(error));}
document.body.dataset.acceptance=failures.length?'failed':'ready';document.body.dataset.failures=JSON.stringify(failures);
parent.postMessage({acceptance:document.body.dataset.acceptance,failures},location.origin);
</script></body></html>'''
        template = (ROOT / 'templates/index.html').read_text()
        shell = template[template.index('    <div class="filters">'):template.index('    <div class="content" id="show-list">')]
        fixture = fixture.replace('__FILTER_SHELL__', shell).encode()

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
                with tempfile.TemporaryDirectory(prefix="tvtracker-watchlist-controls-") as profile:
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
