"""Native Episode Details preserve metadata, watched actions and responsive layout."""

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


class EpisodeDetailsNativeBrowserTests(unittest.TestCase):
    def test_native_episode_details(self):
        browser = os.environ.get("CHROME_BIN") or next(
            (path for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
             if (path := shutil.which(name))), None,
        )
        if not browser:
            if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
                self.fail("CI must provide Chrome for native Episode Details acceptance")
            self.skipTest("Chrome is unavailable locally")

        fixture = r'''<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/static/css/tailwind.css"></head>
<body><div id="episode-detail-content"></div>
<script src="/static/js/audit-utils.js"></script><script src="/static/js/app.js"></script><script src="/static/js/ui.js"></script>
<script>
const show={tmdb_id:42,title:'Synthetic show',number_of_seasons:1,status:'paused',episodes_watched:{'1':[1]},
_episode_list:{'1':[{episode_number:1,name:'First',air_date:'2020-01-01'},{episode_number:2,name:'Episode <b>text</b>',air_date:'2020-01-02',runtime:45,vote_average:8.2,overview:'Overview <script>text<\/script>'},{episode_number:3,name:'Future',air_date:'2099-01-01'}]},
_episode_v2_details:{'1-2':{external_ids:{imdb_id:'tt123',tvdb_id:99}}},_episode_guest_stars:{'1-2':[{id:8,name:'Guest',character:'Guest role'}]},_episode_cast_credits:{'1-2':[{id:9,name:'Cast member',character:'Lead'}]}};
DATA.shows={'42':show};DATA.history=[{id:'old',tmdb_id:42,season:1,episode:1,watched_at:'2020-01-03T00:00:00Z'},{id:'unknown',action:'legacy'}];
activePage='episode-detail';selectedShowId='42';selectedEpisodeContext={showId:'42',season:1,episode:2};
window.readCachedV2EpisodeDetails=()=>({credits:{crew:[{id:12,name:'Director name',job:'Director'},{id:13,name:'Writer name',job:'Writer'}]}});
let resolveSave,rejectSave,calls=[],navigation=[],backs=0,errors=0;
window.playCheckSuccessAnimation=async()=>{};
window.updateEpisodeWatched=async(id,season,episode,watched)=>{
 calls.push({id,season,episode,watched});
 await new Promise((resolve,reject)=>{resolveSave=resolve;rejectSave=reject;});
 show.episodes_watched['1']=watched?[1,2]:[1];
 renderEpisodeDetails(show,1,2,{});
};
window.openEpisodeModal=(...args)=>navigation.push(args);
window.closeEpisodeDetailsPage=()=>{backs++;};
window.addEventListener('unhandledrejection',event=>{errors++;event.preventDefault();});
</script><script src="/static/js/episode-tracking-state-bridge.js"></script><script src="/static/js/episode-crew.js"></script><script src="/static/js/episode-details-vue-bridge.js"></script>
<script type="module">
const failures=[];const check=(ok,label)=>{if(!ok)failures.push(label);};const tick=()=>new Promise(resolve=>setTimeout(resolve,35));
const button=()=>document.getElementById('episode-toggle-watched-button');
try{
const historyBefore=JSON.stringify(DATA.history);
const manifest=await (await fetch('/static/vue/manifest.json')).json();await import('/static/vue/'+manifest['frontend/src/main.ts'].file);
await TVTrackerEpisodeDetailsBridge.renderState('loading','42',1,2);await tick();check(!!document.querySelector('[aria-label="Loading episode"]'),'native loading');
renderEpisodeDetails(show,1,2,{});await tick();
check(document.querySelector('.episode-page-title').textContent==='Episode <b>text</b>'&&!document.querySelector('.episode-page-title b'),'title escaped as text');
check(document.querySelector('.modal-overview').textContent.includes('<script>')&&!document.querySelector('.modal-overview script'),'overview escaped as text');
check(document.querySelectorAll('.v2-external-pill').length===3,'external metadata links');
check(document.querySelector('#episode-panel-Cast').textContent.includes('Guest')&&document.querySelector('#episode-panel-Cast').textContent.includes('Cast member'),'guest and cast groups');
check(document.querySelectorAll('.person-silhouette-placeholder').length>=2,'missing artwork fallback');
const castTab=document.getElementById('episode-tab-Cast');castTab.focus();castTab.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await tick();
check(document.getElementById('episode-tab-Crew').getAttribute('aria-selected')==='true'&&document.activeElement.id==='episode-tab-Crew','keyboard crew selection and focus');
check(!document.getElementById('episode-panel-Crew').hidden&&document.getElementById('episode-panel-Crew').textContent.includes('Director name'),'native crew groups');
renderEpisodeDetails(show,1,2,{});await tick();check(!document.getElementById('episode-panel-Crew').hidden,'tab choice survives metadata refresh');
button().click();await tick();check(calls.length===1&&calls[0].watched===true&&button().disabled&&button().textContent==='MARK WATCHED','one watched action remains pending until acknowledgement');
resolveSave({ok:true});await tick();check(button().textContent==='MARK UNWATCHED'&&!button().disabled,'acknowledged watched state');
button().click();await tick();rejectSave(Error('Synthetic save rejection'));await tick();
check(calls.length===2&&calls[1].watched===false&&!button().disabled&&button().textContent==='MARK UNWATCHED','failed unwatch does not report success or lose existing truth');
check(errors===1,'rejected service remains observable');
document.getElementById('episode-prev-button').click();document.getElementById('episode-next-button').click();
check(navigation.length===2&&navigation[0][2]===1&&navigation[1][2]===3&&navigation[1][3].replaceRoute===true,'existing previous/next routing semantics');
document.getElementById('episode-open-show-button').click();check(backs===1,'back delegates to existing service');
renderEpisodeDetails(show,1,2,{discoverPreview:true});await tick();check(!button()&&document.body.textContent.includes('Not in library'),'preview does not expose tracker action');
selectedEpisodeContext={showId:'42',season:1,episode:3};renderEpisodeDetails(show,1,3,{});await tick();check(!button()&&document.body.textContent.includes('Not aired yet'),'future episode blocked');
check(document.documentElement.scrollWidth<=innerWidth+1,'no episode page overflow '+innerWidth);
await TVTrackerEpisodeDetailsBridge.renderState('error','42',1,3);await tick();check(document.querySelector('[role="alert"]').textContent.includes('failed to load'),'native error');
check(JSON.stringify(DATA.history)===historyBefore,'rendering does not rewrite old or unknown History');
check(document.querySelectorAll('[data-tvtracker-episode-details-owner="vue"]').length===1&&typeof window.renderEpisodeModal==='undefined','single native page owner');
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
