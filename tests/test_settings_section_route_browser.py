"""Settings routes survive delayed shell updates, refresh and browser navigation."""

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


class SettingsSectionRouteBrowserTests(unittest.TestCase):
    def test_settings_section_route_survives_refresh_and_history(self):
        browser = os.environ.get("CHROME_BIN") or next(
            (path for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
             if (path := shutil.which(name))), None,
        )
        if not browser:
            if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
                self.fail("CI must provide Chrome for Settings section route acceptance")
            self.skipTest("Chrome is unavailable locally")

        fixture = r'''<!doctype html><html><body><div id="settings-page" class="page"><div id="settings-content"></div></div>
<script src="/static/js/app.js"></script><script src="/static/js/ui.js"></script><script src="/static/js/settings.js"></script>
<script>
appDataReady=true;
window.renderSettings=()=>{document.getElementById('settings-content').textContent=window.TVTrackerSettings.current();};
</script><script src="/static/js/app-router.js"></script><script>
(async()=>{
const failures=[];
const check=(ok,label)=>{if(!ok)failures.push(label);};
const tick=()=>new Promise(resolve=>setTimeout(resolve,40));
try{
await tick();
const stage=sessionStorage.getItem('route-acceptance-stage');
if(!stage){
 for(const section of ['profile','auth','notifications','streaming','data','danger-zone']){
  TVTrackerSettings.open(section);await tick();
  check(location.pathname==='/app/settings/'+section,'delayed update preserves '+section);
  check(document.getElementById('settings-content').textContent===section,'section state '+section);
 }
 TVTrackerSettings.open('streaming');await tick();
 if(!failures.length){sessionStorage.setItem('route-acceptance-stage','refresh');location.reload();return;}
}else{
 check(location.pathname==='/app/settings/streaming'&&TVTrackerSettings.current()==='streaming','refresh restores Streaming section');
 const moved=()=>new Promise(resolve=>{window.addEventListener('popstate',()=>setTimeout(resolve,50),{once:true});});
 let move=moved();history.back();await move;
 check(location.pathname==='/app/settings/danger-zone'&&TVTrackerSettings.current()==='danger-zone','Back restores previous section');
 move=moved();history.forward();await move;
 check(location.pathname==='/app/settings/streaming'&&TVTrackerSettings.current()==='streaming','Forward restores Streaming section');
 check(document.getElementById('settings-content').textContent==='streaming','visible section matches restored route');
}
}catch(error){failures.push(String(error));}
document.body.dataset.acceptance=failures.length?'failed':'ready';document.body.dataset.failures=JSON.stringify(failures);
})();
</script></body></html>'''.encode()

        class Handler(SimpleHTTPRequestHandler):
            def do_GET(self):
                if self.path.startswith("/app/settings/"):
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
            with tempfile.TemporaryDirectory(prefix="tvtracker-settings-route-") as profile:
                result = subprocess.run([
                    browser, "--headless=new", "--no-sandbox", "--disable-gpu",
                    "--disable-dev-shm-usage", "--disable-background-networking", "--no-proxy-server",
                    "--no-first-run", "--no-default-browser-check", "--virtual-time-budget=8000",
                    f"--user-data-dir={profile}", "--dump-dom", f"http://127.0.0.1:{server.server_port}/app/settings/profile",
                ], capture_output=True, text=True, timeout=25, check=False)
            self.assertEqual(result.returncode, 0, result.stderr[-2000:])
            self.assertIn('data-acceptance="ready"', result.stdout, result.stdout[-4000:])
            self.assertIn('data-failures="[]"', result.stdout)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
