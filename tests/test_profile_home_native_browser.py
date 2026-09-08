"""Profile home and statistics preserve canonical data and navigation."""

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


class ProfileHomeNativeBrowserTests(unittest.TestCase):
    def test_native_profile_home(self):
        browser = os.environ.get("CHROME_BIN") or next(
            (path for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
             if (path := shutil.which(name))), None,
        )
        if not browser:
            if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
                self.fail("CI must provide Chrome for native Profile home acceptance")
            self.skipTest("Chrome is unavailable locally")

        fixture = r'''<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/static/css/tailwind.css"></head><body><div id="profile-content"></div>
<script src="/static/js/audit-utils.js"></script><script src="/static/js/app.js"></script><script src="/static/js/ui.js"></script>
<script>
DATA.shows={'42':{tmdb_id:42,title:'Favorite <b>show</b>',status:'finished',genres:['Drama'],network:'Synthetic network',episodes_watched:{'1':[1]},_episode_list:{'1':[{episode_number:1,runtime:45,air_date:'2020-01-01'}]}};
DATA.movies={};DATA.history=[{id:'episode',tmdb_id:42,season:1,episode:1,watched_at:'2020-01-02T00:00:00Z'},{id:'unknown',action:'legacy'}];
DATA.profile={username:'<b>Alice</b>',avatar_type:'preset',avatar_preset:'silhouette-2',header_type:'preset',header_preset:'purple',favorite_shows:['42'],favorite_movies:[{id:'99',title:'Favorite movie',release_date:'2020-01-01'}]};
activePage='profile';activeProfileView='home';let edits=[],opened=[],syncCalls=0;
window.openFavoritesPopup=kind=>edits.push(kind);
window.openMoviePage=(id,options)=>opened.push({id,kind:'movie',options});
window.openShowDetailsPage=(id,options)=>opened.push({id,kind:'show',options});
window.startNetworkMetadataSync=()=>{syncCalls++;};
window.getNetworkMetadataSyncSummary=()=>({running:false,pending:0,failed:2});
</script><script src="/static/js/profile-vue-bridge.js"></script>
<script type="module">
const failures=[];const check=(ok,label)=>{if(!ok)failures.push(label);};const tick=()=>new Promise(resolve=>setTimeout(resolve,35));
const root=()=>document.getElementById('profile-content');
try{
const stats=getProfileStats();const truth=()=>JSON.stringify({shows:DATA.shows,movies:DATA.movies,history:DATA.history,profile:DATA.profile});const before=truth();
const manifest=await(await fetch('/static/vue/manifest.json')).json();await import('/static/vue/'+manifest['frontend/src/main.ts'].file);
await renderProfile();await tick();
check(root().querySelector('.profile-name').textContent==='<b>Alice</b>'&&!root().querySelector('.profile-name b'),'escaped username');
check(!!root().querySelector('.profile-avatar svg')&&!!root().querySelector('.profile-header-purple'),'existing preset avatar and header');
check(root().querySelectorAll('.profile-favorite-slot').length===16&&root().querySelectorAll('.profile-favorite-slot.filled').length===2,'eight slots per favorite kind');
root().querySelector('[data-favorite-kind="show"][data-favorite-action="open"]').click();root().querySelector('[data-favorite-kind="movie"][data-favorite-action="open"]').click();
check(opened.length===2&&opened.every(x=>x.options.navigationContext==='profile')&&opened[1].options.movieName==='Favorite movie','canonical favorite navigation');
root().querySelector('[data-favorite-kind="show"][data-favorite-action="edit"]').click();document.getElementById('edit-favorite-movies-button').click();
check(edits.join(',')==='show,movie','favorite editors use existing service');
document.getElementById('open-profile-stats').click();await tick();
check(activeProfileView==='stats'&&document.activeElement.id==='profile-stats-back','stats view and keyboard focus');
check(root().querySelectorAll('.profile-detail-stat-card').length===11,'all existing statistics cards');
const values=Array.from(root().querySelectorAll('.profile-detail-stat-value')).map(x=>x.textContent);
check(values[0]===stats.watchTimeText&&values[2]===Number(stats.episodesWatched).toLocaleString()&&values[3]==='1','canonical statistics including old History');
check(root().querySelector('.ranked-stats-sync.warning').textContent==='2 network metadata items will retry next time.','sync failure status');
check(syncCalls===1,'existing metadata sync starts once per stats render');
check(document.documentElement.scrollWidth<=innerWidth+1,'stats fit width '+innerWidth);
document.getElementById('profile-stats-back').click();await tick();check(document.activeElement.id==='open-profile-stats','home focus restored');
check(truth()===before,'rendering and navigation preserve tracker, favorites and History');
DATA.profile.avatar_type='upload';DATA.profile.avatar_data='data:image/webp;base64,UklGRg==';DATA.profile.header_type='upload';DATA.profile.header_image='data:image/webp;base64,UklGRg==';await renderProfile();await tick();
check(root().querySelector('.profile-avatar img').getAttribute('src')===DATA.profile.avatar_data&&!!root().querySelector('.profile-header-image-layer img'),'saved upload presentation');
DATA.profile.avatar_type='initial';DATA.profile.header_type='preset';DATA.profile.favorite_shows=[];DATA.profile.favorite_movies=[];await renderProfile();await tick();
check(root().querySelector('.profile-avatar-initial').textContent==='B'&&root().querySelectorAll('.profile-favorite-slot.empty').length===16,'initial and empty favorites');
check(document.documentElement.scrollWidth<=innerWidth+1,'home fits width '+innerWidth);
activePage='settings';const markup=root().innerHTML;await renderProfile();check(root().innerHTML===markup,'late profile refresh cannot replace another route');
check(root().querySelectorAll('[data-tvtracker-profile-owner="vue"]').length===1&&typeof window.renderProfileHomeView==='undefined','one native Profile owner');
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
