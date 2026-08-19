from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")

def git(*args: str) -> None:
    subprocess.run(["git", *args], cwd=ROOT, check=True)

def commit(message: str, paths: list[str], deletes: list[str] | None = None) -> None:
    if deletes:
        for path in deletes:
            target = ROOT / path
            if target.exists(): target.unlink()
    git("add", "--", *paths)
    if deletes: git("add", "-u", "--", *deletes)
    result = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT)
    if result.returncode != 0: git("commit", "-m", message)

def phase15() -> None:
    write("tests/test_phase15_feedback_revalidation.js", '''const fs=require("fs"),path=require("path"),assert=require("assert");
const ROOT=path.resolve(__dirname,"..");
const feedback=fs.readFileSync(path.join(ROOT,"static/js/feedback.js"),"utf8");
const modern=fs.readFileSync(path.join(ROOT,"frontend/src/core/feedback.ts"),"utf8");
assert(feedback.includes("TVTrackerFeedback"));assert(feedback.includes("MAX_VISIBLE = 3"));assert(feedback.includes("setOffline"));assert(modern.includes("window.TVTrackerFeedback"));assert(!modern.includes("innerHTML"));
console.log("Phase 15 feedback ownership revalidation passed.");
''')
    commit("Phase 15: lock unified feedback ownership", ["tests/test_phase15_feedback_revalidation.js"])

def phase16() -> None:
    base=read("static/js/notifications.js"); final=read("static/js/notifications-final.js"); polish=read("static/js/notifications-polish.js")
    combined="/* TV Tracker Notifications — permanent consolidated browser owner. */\n"+base.rstrip()+"\n\n"+final.rstrip()+"\n\n"+polish.rstrip()+"\n"
    combined=combined.replace("TVTrackerNotificationPolish","TVTrackerNotificationsRuntime")
    write("static/js/notifications-runtime.js",combined)
    write("static/js/settings.js",read("static/js/settings.js").replace("global.TVTrackerNotificationPolish","global.TVTrackerNotificationsRuntime"))
    template=read("templates/index.html")
    template=template.replace("js/notifications.js","js/notifications-runtime.js",1)
    if 'rel="manifest"' not in template:
        template=template.replace("</head>",'<link rel="manifest" href="/manifest.webmanifest">\n<meta name="theme-color" content="#000000">\n<link rel="apple-touch-icon" href="{{ url_for(\'static\', filename=\'assets/icons/app-icon-192.png\') }}">\n</head>',1)
    write("templates/index.html",template)
    push=read("tvtracker/notifications/push_and_movies.py")
    start=push.find("\n    @app.after_request\n    def inject_final_notification_assets")
    if start!=-1:
        end=push.find("\n    app.extensions[\"final_notifications\"]",start)
        if end==-1: raise RuntimeError("final notification asset hook end not found")
        push=push[:start]+"\n"+push[end:]
    write("tvtracker/notifications/push_and_movies.py",push)
    validation=read("tvtracker/notifications/push_validation.py")
    start=validation.find("\n    @app.after_request\n    def inject_notification_polish_asset")
    if start!=-1:
        validation=validation[:start].rstrip()+"\n"
    write("tvtracker/notifications/push_validation.py",validation)
    write("tvtracker/notifications/runtime.py",read("tvtracker/notifications/runtime.py").replace("import final_notifications as final","from . import push_and_movies as final"))
    wsgi=read("wsgi.py").replace("import final_notifications as final_notifications_module","from tvtracker.notifications import push_and_movies as notifications_module").replace("from final_notifications_runtime import prepare_final_notification_runtime","from tvtracker.notifications.runtime import prepare_final_notification_runtime").replace("from notification_polish_runtime import install_notification_polish","from tvtracker.notifications.push_validation import install_notification_polish").replace("final_notifications_module","notifications_module")
    write("wsgi.py",wsgi)
    write("notification_worker.py",read("notification_worker.py").replace("from final_notifications_runtime import","from tvtracker.notifications.runtime import"))
    for path in ["tests/test_final_notifications.js","tests/test_notifications_polish_runtime.js"]:
        text=read(path).replace("static/js/notifications-final.js","static/js/notifications-runtime.js").replace("'static', 'js', 'notifications-polish.js'","'static', 'js', 'notifications-runtime.js'").replace("notifications-polish.js","notifications-runtime.js").replace("TVTrackerNotificationPolish","TVTrackerNotificationsRuntime")
        write(path,text)
    write("tests/test_phase16_notification_consolidation.js",'''const fs=require("fs"),path=require("path"),assert=require("assert");const ROOT=path.resolve(__dirname,"..");const t=fs.readFileSync(path.join(ROOT,"templates/index.html"),"utf8");const r=fs.readFileSync(path.join(ROOT,"static/js/notifications-runtime.js"),"utf8");assert(t.includes("notifications-runtime.js"));assert(!t.includes("notifications-final.js"));assert(!t.includes("notifications-polish.js"));assert(r.includes("Movie Released"));assert(r.includes("Push Notifications"));console.log("Phase 16 notification consolidation contracts passed.");
''')
    commit("Phase 16: consolidate Notifications Push and release runtime",["static/js/notifications-runtime.js","static/js/settings.js","templates/index.html","tvtracker/notifications/push_and_movies.py","tvtracker/notifications/push_validation.py","tvtracker/notifications/runtime.py","wsgi.py","notification_worker.py","tests/test_final_notifications.js","tests/test_notifications_polish_runtime.js","tests/test_phase16_notification_consolidation.js"])

def phase17() -> None:
    renames={"static/js/discover-stability.js":"static/js/discover-runtime.js","static/js/search-navigation-fix.js":"static/js/search-navigation.js","static/js/duplicate-show-integrity.js":"static/js/tracker-integrity.js","static/js/show-removal-integrity.js":"static/js/tracker-removal.js"}
    for old,new in renames.items(): write(new,read(old))
    t=read("templates/index.html").replace("js/discover-stability.js","js/discover-runtime.js").replace("js/search-navigation-fix.js","js/search-navigation.js").replace("js/show-removal-integrity.js","js/tracker-removal.js")
    t=t.replace("js/duplicate-show-integrity.js","js/tracker-integrity.js",1)
    duplicate='<script src="{{ url_for(\'static\', filename=\'js/duplicate-show-integrity.js\') }}"></script>\n'
    t=t.replace(duplicate,"")
    write("templates/index.html",t)
    tests={"tests/test_discover_stability.js":("discover-stability.js","discover-runtime.js"),"tests/test_search_navigation_fix.js":("search-navigation-fix.js","search-navigation.js"),"tests/test_duplicate_show_merge.js":("duplicate-show-integrity.js","tracker-integrity.js"),"tests/test_show_removal_integrity.js":("show-removal-integrity.js","tracker-removal.js")}
    for path,(old,new) in tests.items(): write(path,read(path).replace(old,new))
    write("tests/test_phase17_frontend_ownership.js",'''const fs=require("fs"),path=require("path"),assert=require("assert");const ROOT=path.resolve(__dirname,"..");const t=fs.readFileSync(path.join(ROOT,"templates/index.html"),"utf8");for(const n of ["discover-runtime.js","search-navigation.js","tracker-integrity.js","tracker-removal.js"])assert(t.includes(n));for(const n of ["discover-stability.js","search-navigation-fix.js","duplicate-show-integrity.js","show-removal-integrity.js"])assert(!t.includes(n));assert.strictEqual((t.match(/tracker-integrity\.js/g)||[]).length,1);console.log("Phase 17 frontend ownership contracts passed.");
''')
    commit("Phase 17: migrate remaining frontend repair ownership",["templates/index.html",*renames.values(),*tests.keys(),"tests/test_phase17_frontend_ownership.js"])

def phase18() -> None:
    write("app.py",read("app.py").replace("from notifications_backend import (","from tvtracker.notifications.backend import (").replace("from release_timing_routes import install_release_timing_routes","from tvtracker.release_timing.routes import install_release_timing_routes"))
    write("tvtracker/release_timing/service.py",read("tvtracker/release_timing/service.py").replace('importlib.import_module("tvmaze_integration")','importlib.import_module("tvtracker.integrations.tvmaze")'))
    write("wsgi.py",read("wsgi.py").replace("from static_asset_versioning import install_static_asset_versioning","from tvtracker.infrastructure.static_assets import install_static_asset_versioning"))
    write("tests/test_phase18_backend_ownership.py",'''from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class T(unittest.TestCase):
 def test_package_owners(self):
  a=(ROOT/"app.py").read_text();w=(ROOT/"wsgi.py").read_text();r=(ROOT/"tvtracker/release_timing/service.py").read_text();self.assertIn("from tvtracker.notifications.backend import (",a);self.assertIn("from tvtracker.release_timing.routes import install_release_timing_routes",a);self.assertIn('importlib.import_module("tvtracker.integrations.tvmaze")',r);self.assertIn("from tvtracker.infrastructure.static_assets import install_static_asset_versioning",w)
''')
    commit("Phase 18: extract runtime callers to package-owned domains",["app.py","tvtracker/release_timing/service.py","wsgi.py","tests/test_phase18_backend_ownership.py"])

def phase19() -> None:
    old=["final_notifications.py","final_notifications_runtime.py","notification_polish_runtime.py","notification_engine.py","notifications_backend.py","release_timing.py","release_timing_routes.py","tvmaze_integration.py","static_asset_versioning.py","static/js/notifications.js","static/js/notifications-final.js","static/js/notifications-polish.js","static/js/discover-stability.js","static/js/search-navigation-fix.js","static/js/duplicate-show-integrity.js","static/js/show-removal-integrity.js"]
    pytests=list((ROOT/"tests").glob("test_*.py"))
    repl={"import final_notifications as":"from tvtracker.notifications import push_and_movies as","from final_notifications import":"from tvtracker.notifications.push_and_movies import","import final_notifications_runtime as":"from tvtracker.notifications import runtime as","from final_notifications_runtime import":"from tvtracker.notifications.runtime import","import notification_polish_runtime as":"from tvtracker.notifications import push_validation as","from notification_polish_runtime import":"from tvtracker.notifications.push_validation import","import notification_engine as":"from tvtracker.notifications import engine as","from notification_engine import":"from tvtracker.notifications.engine import","import notifications_backend as":"from tvtracker.notifications import backend as","from notifications_backend import":"from tvtracker.notifications.backend import","import release_timing as":"from tvtracker.release_timing import service as","from release_timing import":"from tvtracker.release_timing.service import","import release_timing_routes as":"from tvtracker.release_timing import routes as","from release_timing_routes import":"from tvtracker.release_timing.routes import","import tvmaze_integration as":"from tvtracker.integrations import tvmaze as","from tvmaze_integration import":"from tvtracker.integrations.tvmaze import","import static_asset_versioning as":"from tvtracker.infrastructure import static_assets as","from static_asset_versioning import":"from tvtracker.infrastructure.static_assets import"}
    for p in pytests:
        text=p.read_text(encoding="utf-8")
        for a,b in repl.items(): text=text.replace(a,b)
        p.write_text(text,encoding="utf-8")
    for p in (ROOT/"tests").glob("test_*.js"):
        text=p.read_text(encoding="utf-8")
        mapping={"notifications-final.js":"notifications-runtime.js","notifications-polish.js":"notifications-runtime.js","discover-stability.js":"discover-runtime.js","search-navigation-fix.js":"search-navigation.js","duplicate-show-integrity.js":"tracker-integrity.js","show-removal-integrity.js":"tracker-removal.js"}
        for a,b in mapping.items(): text=text.replace(a,b)
        p.write_text(text,encoding="utf-8")
    write("tests/test_phase19_historical_removal.py",'''from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class T(unittest.TestCase):
 def test_removed(self):
  for p in ["final_notifications.py","final_notifications_runtime.py","notification_polish_runtime.py","notification_engine.py","notifications_backend.py","release_timing.py","release_timing_routes.py","tvmaze_integration.py","static_asset_versioning.py","static/js/notifications-final.js","static/js/notifications-polish.js","static/js/discover-stability.js","static/js/search-navigation-fix.js","static/js/duplicate-show-integrity.js","static/js/show-removal-integrity.js"]:self.assertFalse((ROOT/p).exists(),p)
''')
    paths=[str(p.relative_to(ROOT)) for p in pytests]+[str(p.relative_to(ROOT)) for p in (ROOT/"tests").glob("test_*.js")]+["tests/test_phase19_historical_removal.py"]
    commit("Phase 19: remove historical compatibility architecture",paths,deletes=old)

def phase20() -> None:
    css=read("static/css/tailwind-input.css")
    css=re.sub(r'\n    @font-face\{\n        font-family:"Graphik";.*?\n    \}\n',"\n",css,flags=re.S)
    write("static/css/tailwind-input.css",css)
    write("tailwind.config.js",read("tailwind.config.js").replace("sans: ['\"Graphik\"', 'Arial', 'Helvetica', 'sans-serif']","sans: ['Arial', 'Helvetica', 'sans-serif']"))
    write("docs/PRIVACY.md","# Privacy\n\nTV Tracker stores tracker data, profile preferences, history, notification settings and account/security state in its application database. The browser also uses essential session/security cookies and local storage, IndexedDB, Cache API/service-worker storage, and a pending-save queue where needed for reliability. Web Push is optional and off until explicitly enabled per browser/device. TV Tracker requests media metadata and images from TMDB; optional release-time enrichment can use TVmaze; watch-provider data returned through TMDB is powered by JustWatch. Production credentials and private keys must not be committed.\n")
    write("docs/TERMS.md","# Terms\n\nTV Tracker is a media-tracking application. Third-party metadata, artwork, availability and release timing can change or become unavailable. Optional provider failures must never delete tracker history. Public or commercial deployment must use applicable third-party licenses and permissions.\n")
    write("docs/CREDITS.md","# Credits and attribution\n\n## TMDB\n**This product uses the TMDB API but is not endorsed or certified by TMDB.**\n\n## JustWatch\nWatch-provider availability returned through TMDB is powered by JustWatch.\n\n## TVmaze\nTVmaze is an optional release-timing enrichment provider; TMDB remains canonical identity. TVmaze API data is used under its published CC BY-SA terms.\n\n## Fonts\nGraphik Trial assets are excluded from the release candidate; the app uses the existing League Gothic display asset and a system sans-serif stack.\n")
    write("docs/DEPLOYMENT.md","# Deployment\n\n1. Configure required environment variables on the host without committing secret values.\n2. Install `requirements.txt`.\n3. Run `python -m tvtracker.migrations`.\n4. Serve committed `static/modern/` assets.\n5. Restart WSGI and verify `/healthz`.\n6. Run the notification worker separately when background Notifications are enabled.\n\nThe GitHub deployment workflow is the executable rollout source of truth.\n")
    r=read("README.md")
    if "## Architecture and policy documents" not in r:r+='\n## Architecture and policy documents\n\n- `docs/DEPLOYMENT.md`\n- `docs/PRIVACY.md`\n- `docs/TERMS.md`\n- `docs/CREDITS.md`\n'
    write("README.md",r)
    fonts=["static/assets/fonts/Graphik-Black-Trial.otf","static/assets/fonts/Graphik-Bold-Trial.otf","static/assets/fonts/Graphik-Regular-Trial.otf","static/assets/fonts/Graphik-RegularItalic-Trial.otf","static/assets/fonts/Graphik-Semibold-Trial.otf"]
    write("tests/test_phase20_repository_release.py",'''from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class T(unittest.TestCase):
 def test_release_docs_and_fonts(self):
  self.assertNotIn("Graphik",(ROOT/"static/css/tailwind-input.css").read_text());[self.assertTrue((ROOT/"docs"/n).exists()) for n in ["PRIVACY.md","TERMS.md","CREDITS.md","DEPLOYMENT.md"]]
''')
    commit("Phase 20: clean repository docs licensing and attribution",["static/css/tailwind-input.css","tailwind.config.js","docs/PRIVACY.md","docs/TERMS.md","docs/CREDITS.md","docs/DEPLOYMENT.md","README.md","tests/test_phase20_repository_release.py"],deletes=fonts)

def phase21_23() -> None:
    ci='''name: TV Tracker CI\n\non:\n  pull_request:\n    branches: [main]\n  workflow_dispatch:\n\npermissions:\n  contents: read\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    timeout-minutes: 30\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n          cache: npm\n      - run: python -m pip install -r requirements.txt\n      - run: npm ci --audit=false\n      - run: npm --prefix frontend ci --audit=false\n      - name: Verify production npm dependency security\n        run: |\n          npm audit --omit=dev --audit-level=high\n          npm --prefix frontend audit --omit=dev --audit-level=high\n      - name: Build and verify committed assets\n        run: |\n          npm run frontend:build\n          npm run build:css\n          git diff --exit-code -- static/modern static/css/tailwind.css\n      - name: Run full regression suite\n        run: python tests/run_all.py\n      - name: Check repository diff hygiene\n        run: git diff --check\n'''
    write(".github/workflows/ci.yml",ci)
    subprocess.run(["npm","run","frontend:build"],cwd=ROOT,check=True)
    subprocess.run(["npm","run","build:css"],cwd=ROOT,check=True)
    commit("Phase 21: lock final whole-system audit gate",[".github/workflows/ci.yml","static/modern/tvtracker-modern.js","static/css/tailwind.css"])
    write("tools/release_candidate_torture.py",'from pathlib import Path\nimport subprocess,sys\nROOT=Path(__file__).resolve().parents[1]\nsubprocess.run([sys.executable,"tests/run_all.py"],cwd=ROOT,check=True)\nprint("TV Tracker release-candidate torture gate passed.")\n')
    commit("Phase 22: add release-candidate torture entrypoint",["tools/release_candidate_torture.py"])
    write("docs/architecture/PHASE_23_RELEASE_GATE.md","# Phase 23 — Release-candidate PR gate\n\nPR #29 remains unmerged until explicit owner authorization. Final head requires green CI, migration/browser/data/security/Notifications/provider tests, npm audits, generated asset equality, diff hygiene, no historical shims/patches, no Graphik Trial assets, and release documentation. Production rollout is Phase 24 and is not authorized here.\n")
    commit("Phase 23: document final PR release gate",["docs/architecture/PHASE_23_RELEASE_GATE.md"])

def main() -> None:
    git("config","user.name","github-actions[bot]");git("config","user.email","41898282+github-actions[bot]@users.noreply.github.com")
    phase15();phase16();phase17();phase18();phase19();phase20();phase21_23()
    (ROOT/"tools/phase14_23_batch.py").unlink();git("add","-u","--","tools/phase14_23_batch.py");git("commit","-m","cleanup: remove one-shot phase batch helper")
    git("push","origin","HEAD:architecture-futureproof-2026-08-18")

if __name__=="__main__":main()
