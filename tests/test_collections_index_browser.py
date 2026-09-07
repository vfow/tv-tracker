"""Native collection controls against the committed bundle and real app services."""

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


class CollectionsIndexBrowserTests(unittest.TestCase):
    def test_native_index_search_focus_paging_filters_and_routes(self):
        browser = os.environ.get("CHROME_BIN") or next(
            (path for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
             if (path := shutil.which(name))), None,
        )
        if not browser:
            if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
                self.fail("CI must provide Chrome for collection acceptance")
            self.skipTest("Chrome is unavailable locally")

        fixture = '''<!doctype html><html><body><div id="genre-detail-content"></div>
<script src="/static/js/app.js"></script><script src="/static/js/ui.js"></script>
<script src="/static/js/discover-vue-bridge.js"></script><script>
const failures=[];
const check=(value,message)=>{if(!value)failures.push(message);};
const flush=(ms=25)=>new Promise(resolve=>setTimeout(resolve,ms));
const button=label=>Array.from(document.querySelectorAll('button')).find(node=>node.textContent.trim()===label);
const count=()=>document.querySelectorAll('.collection-index-card').length;
window.activePage='collections-index';
window.setAppHashRoute=route=>{document.body.dataset.route=route;};
window.restoreCollectionReturnPositionSoon=route=>{document.body.dataset.restore=route;};
window.hydrateVisibleCollectionsForIndex=async()=>{};
window.maybeRunCollectionsLiveSearch=()=>{};
window.navigateBackOrRouteFallback=route=>{document.body.dataset.back=route;};
const collections=Array.from({length:70},(_,index)=>normalizeTMDBCollectionSummary({
  id:100+index,name:'Series '+String(index).padStart(2,'0'),movie_count:2,
  poster_slots:[{title:'First movie',release_date:'2005-01-01'},{title:'Missing poster',release_date:'2006-01-01'}],
  genre_ids:[index%2?28:80],decades:[index%2?'2000':'2010'],average_popularity:index+1
}));
window.collectionsPageState={collections,loaded:true,...buildCollectionsIndexState(collections,{})};
renderActiveCollectionsPage();
const timer=setInterval(async()=>{
if(!document.querySelector('.collection-index-card'))return;
clearInterval(timer);
try{
check(count()===64,'first page');
button('VIEW MORE').click();await flush();check(count()===70,'view more');
check(document.body.dataset.restore.includes('page=2'),'restore route after paging');
button('Genre 28').click();await flush();check(count()===35,'genre filter');
button('2010s').click();await flush();check(count()===0,'combined filters');
button('CLEAR ALL').click();await flush();check(count()===64,'clear filters');
const input=document.querySelector('[data-collection-search]');input.focus();
input.value='Series 01';input.dispatchEvent(new Event('input',{bubbles:true}));
renderActiveCollectionsPage();await flush();
check(document.activeElement===input,'focus survives model refresh');
check(input.value==='Series 01','draft survives model refresh');
await flush(400);check(count()===1,'debounced search');
check(document.body.dataset.route.includes('q=Series%2001'),'search route');
check(document.querySelector('.collection-index-card').getAttribute('href')==='/app/collection/101-series-01','collection link');
check(!!document.querySelector('.collection-stack-placeholder'),'missing artwork');
input.value='Series 02';input.dispatchEvent(new Event('input',{bubbles:true}));
input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await flush();
check(document.querySelector('.collection-card-title').textContent==='Series 02','Enter submits search');
input.value='Late search';input.dispatchEvent(new Event('input',{bubbles:true}));
const route=document.body.dataset.route;window.activePage='shows';await flush(400);
check(document.body.dataset.route===route,'pending search cannot navigate away from another page');
window.activePage='collections-index';
collectionsPageState={loading:true};renderActiveCollectionsPage();await flush();
check(!!document.querySelector('[aria-label="Loading collections"]'),'loading');
collectionsPageState={error:'Provider unavailable'};renderActiveCollectionsPage();await flush();
check(document.querySelector('h2')?.textContent==='Collections could not load','error');
collectionsPageState={query:'<img src=x onerror=alert(1)>',searchDraft:'<img src=x onerror=alert(1)>'};renderActiveCollectionsPage();await flush();
check(document.querySelector('h2')?.textContent==='No matching collections found.','empty search');
check(!document.querySelector('img[src="x"]'),'escaped search value');
document.querySelector('#collections-page-back-button').click();check(document.body.dataset.back==='/app/discover','back');
document.body.dataset.acceptance=failures.length?'failed':'ready';
}catch(error){failures.push(String(error));document.body.dataset.acceptance='failed';}
document.body.dataset.failures=JSON.stringify(failures);
},25);
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
            with tempfile.TemporaryDirectory(prefix="tvtracker-collections-index-browser-") as profile:
                result = subprocess.run([
                    browser, "--headless=new", "--no-sandbox", "--disable-gpu",
                    "--disable-dev-shm-usage", "--disable-background-networking", "--no-proxy-server",
                    "--no-first-run", "--no-default-browser-check", "--virtual-time-budget=5000",
                    f"--user-data-dir={profile}", "--dump-dom", f"http://127.0.0.1:{server.server_port}/fixture",
                ], capture_output=True, text=True, timeout=25, check=False)
            self.assertEqual(result.returncode, 0, result.stderr[-2000:])
            self.assertIn('data-acceptance="ready"', result.stdout, result.stdout[:3500])
            self.assertIn('data-tvtracker-collections-index-owner="vue"', result.stdout)
            self.assertIn('data-failures="[]"', result.stdout)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
