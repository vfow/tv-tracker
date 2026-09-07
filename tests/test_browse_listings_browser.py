"""Native Browse/Genre/discovery controls against the committed bundle and real app services."""

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


class BrowseListingsBrowserTests(unittest.TestCase):
    def test_native_browse_filters_pickers_results_and_shared_root(self):
        browser = os.environ.get("CHROME_BIN") or next(
            (path for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
             if (path := shutil.which(name))), None,
        )
        if not browser:
            if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
                self.fail("CI must provide Chrome for Browse acceptance")
            self.skipTest("Chrome is unavailable locally")

        fixture = '''<!doctype html><html><head><link rel="stylesheet" href="/static/css/tailwind.css"></head><body><div id="genre-detail-content"></div>
<script src="/static/js/app.js"></script><script src="/static/js/ui.js"></script><script src="/static/js/discover-browse.js"></script><script src="/static/js/discover-vue-bridge.js"></script><script>
const failures=[];const check=(ok,label)=>{if(!ok)failures.push(label);};const flush=()=>new Promise(r=>setTimeout(r,25));
const cards=()=>document.querySelectorAll('.genre-result-card');const button=label=>Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()===label);
window.activePage='browse-detail';window.updateShellTitle=()=>{};window.getDetailNavContext=()=> 'discover';window.rememberRouteNavContext=()=>{};
window.setAppHashRoute=route=>{document.body.dataset.route=route;};window.getCurrentAppRoute=()=>document.body.dataset.route||'/app/browse/movie';window.showBrowsePageShell=()=>{activePage='browse-detail';};
window.ensureBrowseReferenceData=async()=>{};window.resolveBrowseLabels=async(state,labels)=>labels;
window.openMoviePage=async(id,options)=>{document.body.dataset.movie=id;document.body.dataset.backRoute=options.backRoute;};window.openDiscoverShowModal=async(item)=>{document.body.dataset.preview=item.id;};
window.getMovieTrackingState=id=>({watched:id==='1',plan:false,favorite:false});
browseOptionState.genres={movie:[{id:28,name:'Action'},{id:35,name:'Comedy'}],tv:[{id:10759,name:'Action & Adventure'}]};browseOptionState.countries=[{code:'gb',name:'United Kingdom'},{code:'us',name:'United States'}];browseOptionState.languages=[{code:'en',name:'English'}];browseOptionState.providers={movie:[{id:8,name:'Netflix'}],tv:[]};browseOptionState.movieCertifications=['PG-13'];
const raw=[{id:1,media_type:'movie',title:'First movie',adult:true,release_date:'2008-01-01',vote_average:8.5,popularity:20},{id:2,media_type:'movie',title:'Second movie',release_date:'2005-01-01',popularity:10}];
window.tmdbGetDiscoverPage=async(path,params)=>({page:params.page,total_pages:params.page===1?2:2,results:params.page===1?raw:[{id:3,title:'Third movie',release_date:'2001-01-01'}]});
window.searchBrowsePicker=async(type,query)=>[{id:9,name:'Synthetic '+type,origin_country:'US'}];
browsePageState={media:'movie',filters:createBrowseFilterState('movie'),labels:createBrowseLabelState(),shows:raw,page:1,totalPages:2};renderActiveBrowsePage();
const timer=setInterval(async()=>{
if(!document.querySelector('[data-tvtracker-browse-listing-owner="vue"] .genre-result-card'))return;clearInterval(timer);
try{
check(cards().length===2,'initial cards');check(!!document.querySelector('.adult-movie-badge'),'adult badge');
document.querySelector('.browse-menu-country summary').click();const input=document.querySelector('[aria-label="Search countries"]');input.value='uk';input.dispatchEvent(new Event('input',{bubbles:true}));await flush();
check(button('United Kingdom')&&!button('United States'),'country aliases');button('United Kingdom').click();await flush();check(document.body.dataset.route.includes('country=gb'),'country route');check(document.querySelector('.browse-menu-country').open,'menu persists across load');check(document.querySelector('[aria-label="Search countries"]').value==='uk','search preserved');
document.querySelector('.browse-menu-year summary').click();button('2000s').click();await flush();check(!!document.querySelector('.browse-year-strip'),'decade year strip');button('2008').click();await flush();check(document.body.dataset.route.includes('year=2008'),'year route');
document.querySelector('.browse-menu-sort summary').click();button('Release Date — Oldest').click();await flush();check(cards()[0].textContent.includes('Third movie'),'actual result sort');
document.querySelector('.browse-menu-service summary').click();document.querySelector('.browse-service-option').click();await flush();check(document.body.dataset.route.includes('providers=8'),'service route');
document.querySelector('.browse-menu-other summary').click();const company=document.querySelector('[aria-label="Search production companies"]');company.value='Studio';company.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,300));button('Synthetic company').click();await flush();check(document.body.dataset.route.includes('companies=9'),'picker route');
document.querySelector('.eye-filter-menu summary').click();button('Hide watched').click();await flush();check(!Array.from(cards()).some(el=>el.dataset.mediaId==='1'),'hide watched');check(document.querySelector('.eye-filter-menu').open,'eye menu stays open');
cards()[0].click();await flush();check(!!document.body.dataset.movie&&document.body.dataset.backRoute===document.body.dataset.route,'movie back route');
button('CLEAR ALL').click();await flush();check(!document.body.dataset.route.includes('companies='),'clear company filter');
const currentCount=cards().length;browsePageState.page=1;browsePageState.totalPages=3;renderActiveBrowsePage();await flush();button('VIEW MORE').click();await flush();check(cards().length>=currentCount,'paging preserves existing cards');
activePage='genre-detail';genrePageState={genreId:28,name:'Action',media:'movie',shows:raw,browse:createBrowseFilterState('movie'),browseLabels:{}};renderActiveGenrePage();await flush();check(document.querySelector('h1').textContent==='Action','genre native title');
activePage='discovery-detail';discoveryPageState={type:'company',value:'9',name:'Synthetic Studio',media:'movie',shows:raw,browse:createBrowseFilterState('movie'),browseLabels:{}};renderActiveDiscoveryFilterPage();await flush();check(document.querySelector('h1').textContent==='Synthetic Studio','discovery native title');
activePage='browse-detail';browsePageState={media:'movie',filters:createBrowseFilterState('movie'),shows:[],loading:true};renderActiveBrowsePage();await flush();check(!!document.querySelector('[aria-label="Loading browse results"]'),'loading');browsePageState.loading=false;browsePageState.error='Provider failed';renderActiveBrowsePage();await flush();check(document.querySelector('h2').textContent==='Browse could not load','error');browsePageState.error='';renderActiveBrowsePage();await flush();check(document.querySelector('h2').textContent==='No movies found','empty');
}catch(error){failures.push(String(error));}
document.body.dataset.acceptance=failures.length?'failed':'ready';document.body.dataset.failures=JSON.stringify(failures);
},25);
</script></body></html>
'''.encode()

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
            with tempfile.TemporaryDirectory(prefix="tvtracker-browse-browser-") as profile:
                result = subprocess.run([
                    browser, "--headless=new", "--no-sandbox", "--disable-gpu",
                    "--disable-dev-shm-usage", "--disable-background-networking", "--no-proxy-server",
                    "--no-first-run", "--no-default-browser-check", "--virtual-time-budget=5000",
                    f"--user-data-dir={profile}", "--dump-dom", f"http://127.0.0.1:{server.server_port}/fixture",
                ], capture_output=True, text=True, timeout=25, check=False)
            self.assertEqual(result.returncode, 0, result.stderr[-2000:])
            self.assertTrue('data-acceptance="ready"' in result.stdout, result.stdout[:3500])
            self.assertIn('data-tvtracker-browse-listing-owner="vue"', result.stdout)
            self.assertIn('data-failures="[]"', result.stdout)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
