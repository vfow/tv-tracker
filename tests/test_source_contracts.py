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
        self.assertIn('2.0-integration', template)
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
        css = self.read('static/css/style.css')
        app_js = self.read('static/js/app.js')
        tmdb_js = self.read('static/js/tmdb.js')
        self.assertIn('View More', ui)
        self.assertIn('loadMoreSearchResults', app_js)
        self.assertIn('loadMoreDiscoverSection', app_js)
        self.assertIn('-webkit-line-clamp:2', css)
        self.assertIn('view-more-button', css)
        self.assertIn('tmdbSearchShowsPage', tmdb_js)

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
        self.assertIn('Registration coming soon', login_template)
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

    def test_v2_asset_paths_are_refresh_safe(self):
        app_js = self.read('static/js/app.js')
        ui = self.read('static/js/ui.js')
        self.assertNotIn('src="static/assets/', app_js)
        self.assertNotIn('src="static/assets/', ui)
        self.assertIn('src="/static/assets/icons/arrow-narrow-left.svg"', app_js)
        self.assertIn('src="/static/assets/icons/arrow-narrow-left.svg"', ui)


if __name__ == '__main__':
    unittest.main()
