"""Movie panels must be visibly rendered with the production CSS and Vue bundle."""

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


class MoviePanelsBrowserTests(unittest.TestCase):
    def test_all_movie_panels_visible_with_production_css(self):
        browser = os.environ.get("CHROME_BIN") or next(
            (path for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
             if (path := shutil.which(name))), None,
        )
        if not browser:
            if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
                self.fail("CI must provide Chrome for movie panel acceptance")
            self.skipTest("Chrome is unavailable locally")

        fixture = '''<!doctype html><html><head><link rel="stylesheet" href="/static/css/tailwind.css"></head><body>
<div id="show-detail-content"></div>
<script src="/static/js/app.js"></script><script src="/static/js/ui.js"></script>
<script src="/static/js/media-details-node-model.js"></script>
<script src="/static/js/movie-details-native-panels.js"></script>
<script src="/static/js/movie-details-vue-bridge.js"></script>
<script>
const failures=[];
const check=(ok,label)=>{if(!ok)failures.push(label);};
const visible=element=>!!element&&element.getClientRects().length>0&&getComputedStyle(element).visibility!=='hidden';
const panel=()=>document.querySelector('.movie-detail-tab-content');
window.activePage='movie-detail';window.selectedMovieId=155;
window.updateShellTitle=()=>{};window.attachV2RailScrollEvents=()=>{};
window.moviePageState={movie:normalizeMovieDetails({id:155,title:'Synthetic movie',original_title:'Synthetic movie',overview:'Visible synopsis',tagline:'Visible tagline',release_date:'2008-07-18',runtime:152,genres:[{id:28,name:'Action'}],credits:{cast:[{id:3894,name:'Christian Bale',character:'Bruce Wayne'}],crew:[{id:525,name:'Christopher Nolan',job:'Director',department:'Directing'}]},release_dates:{results:[{iso_3166_1:'US',release_dates:[{release_date:'2008-07-18T00:00:00.000Z',type:3,certification:'PG-13'}]}]}})};
renderMovieDetailPage(moviePageState);
const timer=setInterval(()=>{
if(!document.querySelector('[data-tvtracker-movie-details-owner="vue"] [data-movie-detail-tab]'))return;
clearInterval(timer);
try{
for(const [name,selector,copy] of [
['Info','.overview','Visible synopsis'],['Cast','.v2-actor-name','Christian Bale'],['Crew','.v2-actor-name','Christopher Nolan'],['Details','.episode-detail-value','Synthetic movie'],['Genres','.show-detail-genre-chip','Action'],['Releases','.movie-release-type-label','Theatrical']
]){
const tab=document.querySelector(`[data-movie-detail-tab="${name}"]`);tab.click();
check(document.querySelector(`[data-movie-detail-tab="${name}"]`).getAttribute('aria-selected')==='true',name+' selected');
const element=panel().querySelector(selector);
check(visible(element),name+' content visible through ancestors');
check(panel().textContent.includes(copy),name+' content preserved');
if(name==='Cast')check(panel().querySelector('a.v2-person-card-link')?.getAttribute('href')==='/app/person/3894-christian-bale?media=movie&role=acting','actor link');
if(name==='Crew')check(panel().querySelector('a.v2-person-card-link')?.getAttribute('href')==='/app/person/525-christopher-nolan?media=movie&role=director','director link');
}
}catch(error){failures.push(String(error));}
document.body.dataset.acceptance=failures.length?'failed':'ready';document.body.dataset.failures=JSON.stringify(failures);
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
            with tempfile.TemporaryDirectory(prefix="tvtracker-movie-panels-browser-") as profile:
                result = subprocess.run([
                    browser, "--headless=new", "--no-sandbox", "--disable-gpu",
                    "--disable-dev-shm-usage", "--disable-background-networking", "--no-proxy-server",
                    "--no-first-run", "--no-default-browser-check", "--virtual-time-budget=5000",
                    f"--user-data-dir={profile}", "--dump-dom", f"http://127.0.0.1:{server.server_port}/fixture",
                ], capture_output=True, text=True, timeout=25, check=False)
            self.assertEqual(result.returncode, 0, result.stderr[-2000:])
            self.assertTrue('data-acceptance="ready"' in result.stdout, result.stdout[:3500])
            self.assertIn('data-tvtracker-movie-details-owner="vue"', result.stdout)
            self.assertIn('data-failures="[]"', result.stdout)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
