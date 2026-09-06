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


class CollectionNativeBrowserTests(unittest.TestCase):
    def test_bundle_filters_preserves_menu_state_and_opens_filtered_back_route(self):
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
const flush=()=>new Promise(resolve=>setTimeout(resolve,25));
const titles=()=>Array.from(document.querySelectorAll('.collection-movie-card'),card=>card.dataset.mediaId).join(',');
const button=(label)=>Array.from(document.querySelectorAll('button')).find(node=>node.textContent.trim()===label);
window.activePage='collection-detail';window.selectedCollectionId='263';
window.setAppHashRoute=route=>{document.body.dataset.route=route;};
window.getMovieTrackingState=id=>({watched:id==='1',plan:false,favorite:false});
window.openMoviePage=async(id,options)=>{document.body.dataset.opened=id;document.body.dataset.backRoute=options.backRoute;};
window.navigateBackOrRouteFallback=route=>{document.body.dataset.back=route;};
const collection=normalizeTMDBCollectionDetails({id:263,name:'Synthetic Collection',parts:[
{id:3,title:'<img src=x onerror=alert(1)>',genre_ids:[28],original_language:'en',release_date:'2012-01-01',adult:true,vote_average:8.5},
{id:2,title:'Second movie',genre_ids:[80],original_language:'fr',release_date:'2008-01-01'},
{id:1,title:'First movie',genre_ids:[28],original_language:'en',release_date:'2005-01-01'}]});
window.collectionDetailPageState={collectionId:'263',collection,movies:collection.parts,...buildCollectionDetailState(collection,collection.parts,{})};
renderActiveCollectionDetailPage();
const timer=setInterval(async()=>{
if(!document.querySelector('.collection-movie-card'))return;
clearInterval(timer);
try{
check(titles()==='3,2,1','collection order');
check(!document.querySelector('img[src="x"]'),'escaped title');
check(!!document.querySelector('.adult-movie-badge'),'adult badge');
button('Release Date — Oldest').click();await flush();check(titles()==='1,2,3','sort');
button('2000s').click();await flush();check(titles()==='1,2','decade');
button('2008').click();await flush();check(titles()==='2','year');
button('CLEAR ALL').click();await flush();
button('French').click();await flush();check(titles()==='2','language');
button('CLEAR ALL').click();await flush();
button('Genre 28').click();await flush();check(titles()==='3,1','genre');
document.querySelector('.eye-filter-menu summary').click();
button('Hide watched').click();await flush();check(titles()==='3','eye');
check(document.querySelector('.eye-filter-menu').open,'eye menu remains open');
const card=document.querySelector('.collection-movie-card');
document.addEventListener('click',event=>{if(event.ctrlKey)event.preventDefault();});
card.dispatchEvent(new MouseEvent('click',{ctrlKey:true,bubbles:true,cancelable:true}));await flush();
check(!document.body.dataset.opened,'modified link click');
card.click();await flush();
check(document.body.dataset.opened==='3','open movie');
check(document.body.dataset.backRoute.includes('genre=28')&&document.body.dataset.backRoute.includes('hideWatched=1'),'filtered back route');
document.querySelector('#collection-detail-page-back-button').click();
check(document.body.dataset.back==='/app/collections','back fallback');
collectionDetailPageState={collectionId:'263',loading:true};renderActiveCollectionDetailPage();await flush();
check(!!document.querySelector('[aria-label="Loading collection movies"]'),'loading');
collectionDetailPageState={collectionId:'263',error:'Provider unavailable'};renderActiveCollectionDetailPage();await flush();
check(document.querySelector('h2')?.textContent==='Collection could not load','error');
collectionDetailPageState={collectionId:'263'};renderActiveCollectionDetailPage();await flush();
check(document.querySelector('h2')?.textContent==='No movies found','empty');
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
            with tempfile.TemporaryDirectory(prefix="tvtracker-collection-browser-") as profile:
                result = subprocess.run([
                    browser, "--headless=new", "--no-sandbox", "--disable-gpu",
                    "--disable-dev-shm-usage", "--disable-background-networking", "--no-proxy-server",
                    "--no-first-run", "--no-default-browser-check", "--virtual-time-budget=5000",
                    f"--user-data-dir={profile}", "--dump-dom", f"http://127.0.0.1:{server.server_port}/fixture",
                ], capture_output=True, text=True, timeout=25, check=False)
            self.assertEqual(result.returncode, 0, result.stderr[-2000:])
            self.assertIn('data-acceptance="ready"', result.stdout, result.stdout[:3500])
            self.assertIn('data-tvtracker-collection-detail-owner="vue"', result.stdout)
            self.assertIn('data-failures="[]"', result.stdout)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
