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


class TrendingNativeBrowserTests(unittest.TestCase):
    def test_real_bundle_renders_trending_text_cards_and_native_actions(self):
        browser = os.environ.get("CHROME_BIN") or next(
            (path for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
             if (path := shutil.which(name))), None,
        )
        if not browser:
            if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
                self.fail("CI must provide Chrome for Trending native acceptance")
            self.skipTest("Chrome is unavailable locally")

        fixture = b'''<!doctype html><html><body><div id="genre-detail-content"></div>
<script>
window.activePage='discovery-detail';
window.TVTrackerTrending={parseRoute:()=> 'movie-day',routeFor:()=> '/app/discover?trending=movie-day'};
window.getMovieDetailRoute=id=> '/app/movie/'+id+'-synthetic';
window.getMediaPosterPlaceholderLabel=()=> 'Synthetic placeholder';
window.openMoviePage=async(id,options)=>{document.body.dataset.opened=id;document.body.dataset.backRoute=options.backRoute;};
window.navigateBackOrRouteFallback=route=>{document.body.dataset.back=route;};
</script><script src="/static/js/discover-vue-bridge.js"></script><script>
window.TVTrackerDiscoverVueBridge.renderTrending({key:'movie-day',media:'movie',title:'Synthetic trending'},[
{id:101,title:'<img src=x onerror=alert(1)>',media_type:'movie',adult:true,vote_average:8.5,release_date:'2026-01-01'},
{id:102,title:'Second movie',media_type:'movie'}],false,'');
const timer=setInterval(()=>{
const card=document.querySelector('.trending-result-card');if(!card)return;
clearInterval(timer);
card.click();document.querySelector('#trending-page-back-button').click();
document.body.dataset.acceptance='ready';
},25);
</script></body></html>'''

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
            with tempfile.TemporaryDirectory(prefix="tvtracker-trending-browser-") as profile:
                result = subprocess.run([
                    browser, "--headless=new", "--no-sandbox", "--disable-gpu",
                    "--disable-dev-shm-usage", "--disable-background-networking", "--no-proxy-server",
                    "--no-first-run", "--no-default-browser-check", "--virtual-time-budget=5000",
                    f"--user-data-dir={profile}", "--dump-dom", f"http://127.0.0.1:{server.server_port}/fixture",
                ], capture_output=True, text=True, timeout=25, check=False)
            self.assertEqual(result.returncode, 0, result.stderr[-2000:])
            self.assertIn('data-tvtracker-trending-owner="vue"', result.stdout)
            self.assertIn('data-acceptance="ready"', result.stdout)
            self.assertIn('data-opened="101"', result.stdout)
            self.assertIn('data-back-route="/app/discover?trending=movie-day"', result.stdout)
            self.assertIn('data-back="/app/discover"', result.stdout)
            self.assertIn('&lt;img src=x onerror=alert(1)&gt;', result.stdout)
            self.assertIn('genre-card-placeholder media-title-placeholder', result.stdout)
            self.assertIn('adult-movie-badge', result.stdout)
            self.assertIn('Second movie', result.stdout)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
