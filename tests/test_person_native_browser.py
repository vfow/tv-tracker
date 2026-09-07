"""Native person controls against the committed bundle and real app services."""

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


class PersonNativeBrowserTests(unittest.TestCase):
    def test_native_person_roles_media_biography_progress_and_adult_policy(self):
        browser = os.environ.get("CHROME_BIN") or next(
            (path for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
             if (path := shutil.which(name))), None,
        )
        if not browser:
            if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
                self.fail("CI must provide Chrome for person acceptance")
            self.skipTest("Chrome is unavailable locally")

        fixture = '''<!doctype html><html><body><div id="person-detail-content"></div>
<script src="/static/js/app.js"></script><script src="/static/js/ui.js"></script>
<script>window.DATA.profile.adult_filter=false;</script><script src="/static/js/adult-filter.js"></script>
<script src="/static/js/discover-vue-bridge.js"></script><script>
const failures=[];
const check=(value,message)=>{if(!value)failures.push(message);};
const flush=()=>new Promise(resolve=>setTimeout(resolve,25));
const count=()=>document.querySelectorAll('.person-result-card').length;
const button=label=>Array.from(document.querySelectorAll('button')).find(node=>node.textContent.trim()===label);
window.activePage='person-detail';window.selectedPersonContext={personId:'10',role:''};
window.setAppHashRoute=route=>{document.body.dataset.route=route;};
window.getCurrentAppRoute=()=>document.body.dataset.route||'/app/person/10-synthetic-person?media=movie';
window.getDetailNavContext=()=> 'discover';window.rememberRouteNavContext=()=>{};
window.showPersonDetailPageShell=()=>{window.activePage='person-detail';};
window.getMovieTrackingState=id=>({watched:id==='1',plan:false,favorite:false});
window.openMoviePage=async(id)=>{document.body.dataset.openedMovie=id;};
window.openDiscoverShowModal=async(item)=>{document.body.dataset.openedShow=item.id;};
window.navigateBackOrRouteFallback=route=>{document.body.dataset.back=route;};
const person=normalizePersonDetails({id:10,name:'Synthetic Person',biography:'<img src=x onerror=alert(1)> biography '.repeat(20),combined_credits:{cast:[
{id:1,media_type:'movie',title:'First movie',character:'Lead',popularity:20,release_date:'2005-01-01',adult:true},
{id:2,media_type:'movie',title:'Second movie',character:'Guest',popularity:10,release_date:'2008-01-01'},
{id:3,media_type:'tv',name:'Synthetic show',character:'TV lead',popularity:5,first_air_date:'2010-01-01'}
],crew:[{id:1,media_type:'movie',title:'First movie',job:'Director',department:'Directing',popularity:20,release_date:'2005-01-01'}]}});
window.personPageState={personId:'10',role:'',media:'movie',person,credits:getPersonCreditsForRole(person,'','movie')};
renderActivePersonPage();
const timer=setInterval(async()=>{
if(!document.querySelector('.person-result-card'))return;
clearInterval(timer);
try{
check(count()===2,'merged filmography');
check(!!document.querySelector('.adult-movie-badge'),'adult badge');
check(!document.querySelector('img[src="x"]'),'escaped biography');
check(!!document.querySelector('.person-profile-placeholder'),'portrait fallback');
check(document.querySelector('.person-progress-copy strong').textContent==='1 of 2','watched progress');
button('more').click();await flush();check(!!document.querySelector('.person-profile-bio-wrap.is-expanded'),'expanded biography');
document.querySelector('.eye-filter-menu summary').click();button('Hide watched').click();await flush();
check(count()===1,'eye filter');check(document.querySelector('.eye-filter-menu').open,'eye menu remains open');
check(document.querySelector('.person-progress-copy strong').textContent==='1 of 2','progress unaffected by eye visibility');
button('Hide watched').click();await flush();
document.querySelector('[data-person-role-filter="director"]').click();await flush();
check(count()===1&&document.body.dataset.route.includes('role=director'),'role filter route');
document.querySelector('.person-result-card').click();await flush();check(document.body.dataset.openedMovie==='1','open movie');
document.querySelector('[data-person-media="tv"]').click();await flush();
check(count()===1&&document.body.dataset.route.includes('media=tv'),'TV switch');
check(!document.body.dataset.route.includes('role=director'),'unsupported role cleared');
check(!!document.querySelector('.person-profile-bio-wrap.is-expanded'),'biography stays expanded during filtering');
document.querySelector('.person-result-card').click();await flush();check(document.body.dataset.openedShow==='3','open TV preview');
document.querySelector('[data-person-media="movie"]').click();await flush();check(count()===2,'movie switch');
DATA.profile.adult_filter=true;personPageState.credits=getPersonCreditsForRole(person,'','movie');renderActivePersonPage();await flush();
check(count()===1,'adult policy');
personPageState={personId:'10',loading:true};renderActivePersonPage();await flush();
check(!!document.querySelector('[aria-label="Loading person credits"]'),'loading');
personPageState={personId:'10',error:'Provider unavailable'};renderActivePersonPage();await flush();
check(document.querySelector('h2')?.textContent==='Person could not load','error');
personPageState={personId:'10',media:'movie'};renderActivePersonPage();await flush();
check(document.querySelector('h2')?.textContent==='No movies found','empty');
document.querySelector('#person-page-back-button').click();check(document.body.dataset.back==='/app/discover','back');
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
            with tempfile.TemporaryDirectory(prefix="tvtracker-person-browser-") as profile:
                result = subprocess.run([
                    browser, "--headless=new", "--no-sandbox", "--disable-gpu",
                    "--disable-dev-shm-usage", "--disable-background-networking", "--no-proxy-server",
                    "--no-first-run", "--no-default-browser-check", "--virtual-time-budget=5000",
                    f"--user-data-dir={profile}", "--dump-dom", f"http://127.0.0.1:{server.server_port}/fixture",
                ], capture_output=True, text=True, timeout=25, check=False)
            self.assertEqual(result.returncode, 0, result.stderr[-2000:])
            self.assertIn('data-acceptance="ready"', result.stdout, result.stdout[:3500])
            self.assertIn('data-tvtracker-person-owner="vue"', result.stdout)
            self.assertIn('data-failures="[]"', result.stdout)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
