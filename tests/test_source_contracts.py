from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class TMDBOnlyContractTests(unittest.TestCase):
    def read(self, relative: str) -> str:
        return (ROOT / relative).read_text(encoding='utf-8')

    def test_source_section_removed(self):
        ui = self.read('static/js/ui.js')
        self.assertNotIn('Metadata ' + 'Source', ui)
        self.assertNotIn('Artwork ' + 'Source', ui)
        self.assertNotIn('<h2>SOURCE</h2>', ui)
        self.assertIn('Export or import a full backup of this tracker.', ui)
        self.assertNotIn('Export a full backup of this tracker.', ui)

    def test_source_provider_script_removed_from_template(self):
        template = self.read('templates/index.html')
        self.assertNotIn('source-' + 'provider.js', template)
        self.assertIn('2.0-tailwind', template)
        self.assertIn('v2-router.js', template)
        self.assertNotIn('static-adapter.js', template)

    def test_backend_proxy_is_tmdb_only(self):
        app_py = self.read('app.py')
        self.assertIn('/api/tmdb/<path:tmdb_path>', app_py)
        self.assertNotIn('api.' + 'tv' + 'maze.com', app_py)

    def test_legacy_metadata_cleanup_exists(self):
        app_py = self.read('app.py')
        app_js = self.read('static/js/app.js')
        self.assertIn('clean_legacy_metadata', app_py)
        self.assertIn('cleanLegacyMetadata', app_js)

    def test_empty_season_has_final_empty_state(self):
        ui = self.read('static/js/ui.js')
        app_js = self.read('static/js/app.js')
        self.assertIn('Episode list not announced yet.', ui)
        self.assertIn('Loading episode list...', ui)
        self.assertIn('seasonEpisodeListIsLoadedEmpty', ui)
        self.assertIn('Number(show._season_episodes[seasonKey] || 0) === 0', app_js)


    def test_watch_log_integrity_repair_exists(self):
        app_js = self.read('static/js/app.js')
        app_py = self.read('app.py')
        self.assertIn('getDeterministicHistoryId', app_js)
        self.assertIn('normalizeTrackerDataForEpisodeIntegrity', app_js)
        self.assertIn('removeExistingHistoryEntriesForEpisode', app_js)
        self.assertIn('isEpisodeLoggable', app_js)
        self.assertIn('dedupe_history_by_episode', app_py)
        self.assertIn('find_logical_duplicate_history_ids', app_py)

    def test_discover_description_and_view_more_polish_exists(self):
        ui = self.read('static/js/ui.js')
        css = self.read('static/css/tailwind-input.css')
        app_js = self.read('static/js/app.js')
        tmdb_js = self.read('static/js/tmdb.js')
        self.assertIn('View More', ui)
        self.assertIn('loadMoreSearchResults', app_js)
        self.assertIn('loadMoreDiscoverSection', app_js)
        self.assertIn('-webkit-line-clamp:2', css)
        self.assertIn('view-more-button', css)
        self.assertIn('tmdbSearchShowsPage', tmdb_js)

    def test_frontend_uses_tailwind_only_assets(self):
        template = "\n".join([
            self.read('templates/index.html'),
            self.read('templates/login.html'),
            self.read('templates/error.html'),
        ])
        ui = self.read('static/js/ui.js')
        self.assertIn('tailwind.css', template)
        self.assertIn('2.0-tailwind', template)
        self.assertNotIn('2.0-integration', template)
        self.assertNotIn('bootstrap.min.css', template)
        self.assertNotIn('bootstrap.bundle.min.js', template)
        self.assertNotIn('css/style.css', template)
        self.assertNotIn('css/foundation.css', template)
        self.assertNotIn('js/shell.js', template)
        self.assertNotIn('window.bootstrap', ui)
        self.assertFalse((ROOT / 'static/css/style.css').exists())
        self.assertFalse((ROOT / 'static/css/foundation.css').exists())
        self.assertFalse((ROOT / 'static/js/shell.js').exists())
        self.assertFalse((ROOT / 'static/assets/favicon.svg').exists())
        self.assertFalse((ROOT / 'static/assets/WATCH TIME.svg').exists())
        self.assertFalse((ROOT / 'static/assets/EPISODES WATCHED.svg').exists())

    def test_real_protected_page_routes_exist(self):
        app_py = self.read('app.py')
        router = self.read('static/js/v2-router.js')
        template = self.read('templates/index.html')
        self.assertIn('@app.get("/app/watchlist", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/upcoming", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/history", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/discover", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/profile", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/settings", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/show/<int:tmdb_id>", strict_slashes=False)', app_py)
        self.assertIn('"/app/show/<int:tmdb_id>/season/<int:season_number>/episode/<int:episode_number>"', app_py)
        self.assertNotIn('@app.get("/app/<path:app_path>")', app_py)
        self.assertIn('/app/watchlist', app_py)
        self.assertIn('/app/show/', router)
        self.assertIn('/season/', router)
        self.assertIn('/episode/', router)
        self.assertNotIn('#/app', router)
        self.assertIn('show-detail-page', template)
        self.assertIn('episode-detail-page', template)

    def test_friendly_error_page_copy_exists(self):
        app_py = self.read('app.py')
        error_template = self.read('templates/error.html')
        self.assertIn("We're not in Kansas anymore", app_py)
        self.assertIn('This page is off the map.', app_py)
        self.assertIn('Houston, we have a problem', app_py)
        self.assertIn('Something went wrong. Try again in a moment.', app_py)
        self.assertIn('{{ error_title }}', error_template)
        self.assertIn('{{ error_text }}', error_template)

    def test_auth_tabs_and_server_side_return_path_exist(self):
        app_py = self.read('app.py')
        login_template = self.read('templates/login.html')
        db_js = self.read('static/js/db.js')
        self.assertIn('post_login_path', app_py)
        self.assertIn('@app.get("/signup")', app_py)
        self.assertIn('Track your Movies, Shows and Anime all in one place', login_template)
        self.assertIn('Registration coming soon', login_template)
        self.assertNotIn('Your watch history stays private to this signed-in session.', login_template)
        self.assertNotIn('New account creation is not available yet.', login_template)
        self.assertIn('data-auth-tab="login"', login_template)
        self.assertIn('data-auth-tab="signup"', login_template)
        self.assertNotIn('name="next"', login_template)
        self.assertNotIn('login?next=', db_js)

    def test_v2_uses_server_tmdb_proxy_without_browser_key_ui(self):
        config = self.read('static/js/config.js')
        tmdb = self.read('static/js/tmdb.js')
        ui = self.read('static/js/ui.js')
        template = self.read('templates/index.html')
        self.assertIn('const TMDB_API_BASE = "/api/tmdb"', config)
        self.assertIn('The key is held by Flask', tmdb)
        self.assertNotIn('TMDB API KEY', ui)
        self.assertNotIn('TVTrackerStaticAdapter', ui)
        self.assertNotIn('static-adapter.js', template)

    def test_frontend_security_hardening_exists(self):
        app_py = self.read('app.py')
        ui = self.read('static/js/ui.js')
        self.assertIn('function safeExternalURL', ui)
        self.assertIn('const homepageURL = show ? safeExternalURL(show.homepage) : "";', ui)
        self.assertNotIn('href="${escapeHTML(show.homepage)}"', ui)
        self.assertIn('"script-src \'self\'"', app_py)
        self.assertIn('"style-src \'self\' \'unsafe-inline\'"', app_py)
        self.assertNotIn('cdn.jsdelivr.net', app_py)

    def test_profile_header_presets_survive_tailwind_purge(self):
        config = self.read('tailwind.config.js')
        source_css = self.read('static/css/tailwind-input.css')
        built_css = self.read('static/css/tailwind.css')
        ui = self.read('static/js/ui.js')
        self.assertIn('profile-header-${preset}', ui)
        for class_name in (
            'profile-header-default',
            'profile-header-blue',
            'profile-header-purple',
            'profile-header-green',
            'profile-header-amber',
            'profile-header-monochrome',
        ):
            self.assertIn(class_name, config)
            self.assertIn(f'.{class_name}', source_css)
            self.assertIn(f'.{class_name}', built_css)

    def test_v2_asset_paths_are_refresh_safe(self):
        app_js = self.read('static/js/app.js')
        ui = self.read('static/js/ui.js')
        self.assertNotIn('src="static/assets/', app_js)
        self.assertNotIn('src="static/assets/', ui)
        self.assertIn('src="/static/assets/icons/arrow-narrow-left.svg"', app_js)
        self.assertIn('src="/static/assets/icons/arrow-narrow-left.svg"', ui)

    def test_deploy_workflow_tests_and_checks_healthz(self):
        app_py = self.read('app.py')
        workflow = self.read('.github/workflows/deploy.yml')
        readme = self.read('README.md')
        run_all = self.read('tests/run_all.py')

        self.assertIn('@app.get("/healthz")', app_py)
        self.assertIn('@app.get("/api/health")', app_py)
        self.assertIn('python tests/run_all.py', workflow)
        self.assertIn('appleboy/ssh-action', workflow)
        self.assertIn('git pull --ff-only origin main', workflow)
        self.assertIn('https://broghgf7.alwaysdata.net/healthz', workflow)
        self.assertIn('/healthz', readme)
        self.assertIn('test_sync_reliability.js', run_all)


if __name__ == '__main__':
    unittest.main()
