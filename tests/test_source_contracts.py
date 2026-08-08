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
        self.assertIn('app-router.js', template)
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
        self.assertIn('VIEW MORE', ui)
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

    def test_tailwind_preserves_legacy_layout_reset(self):
        css = self.read('static/css/tailwind-input.css')
        self.assertIn('margin:0;', css)
        self.assertIn('padding:0;', css)
        self.assertIn('@apply tw-mt-auto tw-mb-[30px];', css)

    def test_show_page_remove_button_stays_in_status_row(self):
        css = self.read('static/css/tailwind-input.css')
        self.assertIn('.show-page-status-buttons .remove-show-button', css)
        self.assertIn('@apply tw-ml-0;', css)

    def test_real_protected_page_routes_exist(self):
        app_py = self.read('app.py')
        router = self.read('static/js/app-router.js')
        template = self.read('templates/index.html')
        self.assertIn('@app.get("/app/list/<list_slug>", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/upcoming", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/history", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/discover", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/discover/<media_type>/<category_slug>", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/search", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/profile", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/settings", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/show/<show_key>", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/genre/<genre_slug>", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/network/<network_key>", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/language/<language_code>", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/country/<country_code>", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/theme/<theme_key>", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/movie/<movie_key>", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/company/<company_key>", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/provider/<provider_key>", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/year/<int:year_value>", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/status/<status_slug>", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/certification/<media_type>/<certification_slug>", strict_slashes=False)', app_py)
        self.assertIn('@app.get("/app/<person_role>/<person_key>", strict_slashes=False)', app_py)
        self.assertIn('"/app/show/<show_key>/season/<int:season_number>/episode/<int:episode_number>"', app_py)
        self.assertNotIn('@app.get("/app/<path:app_path>")', app_py)
        self.assertIn('/app/list/watching', app_py)
        self.assertIn('/app/show/', router)
        self.assertIn('/app/genre/', router)
        self.assertIn('/app/search', router)
        self.assertIn('app\\/movie', router)
        self.assertIn('network|theme|company|provider', router)
        self.assertIn('yearMatch', router)
        self.assertIn('statusMatch', router)
        self.assertIn('certificationMatch', router)
        self.assertIn('language)', router)
        self.assertIn('country)', router)
        self.assertIn('actor|creator|director|writer|producer|editor|composer|cinematographer', router)
        self.assertIn('/season/', router)
        self.assertIn('/episode/', router)
        self.assertNotIn('#/app', router)
        self.assertIn('show-detail-page', template)
        self.assertIn('genre-detail-page', template)
        self.assertIn('person-detail-page', template)
        self.assertIn('show-detail-filters.js', template)
        self.assertIn('episode-detail-page', template)
        self.assertIn('openPersonPage', router)
        self.assertIn('openDiscoveryFilterPage', router)
        ui = self.read('static/js/ui.js')
        self.assertIn('renderPersonDetailPage', ui)
        self.assertIn('renderDiscoveryFilterDetailPage', ui)
        self.assertIn('renderMovieDetailPage', ui)
        self.assertIn('renderSearchResults', ui)
        self.assertIn('renderDiscoverGenreSection', ui)
        self.assertIn('renderSearchTabButtonHTML', ui)
        self.assertIn('renderShowThemesDetailsHTML', ui)

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

    def test_app_uses_server_tmdb_proxy_without_browser_key_ui(self):
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

    def test_app_asset_paths_are_refresh_safe(self):
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
        self.assertIn('appleboy/ssh-action@7eaf76671a0d7eec5d98ee897acda4f968735a17', workflow)
        self.assertIn('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', workflow)
        self.assertIn('actions/setup-python@83679a892e2d95755f2dac6acb0bfd1e9ac5d548', workflow)
        self.assertIn('actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38', workflow)
        self.assertIn('git pull --ff-only origin main', workflow)
        self.assertIn('ALWAYSDATA_HEALTH_URL', workflow)
        self.assertIn('ALWAYSDATA_APP_DIR', workflow)
        self.assertNotIn('broghgf7', workflow)
        self.assertNotIn('ssh-broghgf7', workflow)
        self.assertIn('/healthz', readme)
        self.assertIn('test_sync_reliability.js', run_all)

    def test_phase51_search_routing_polish_exists(self):
        app_js = self.read('static/js/app.js')
        ui = self.read('static/js/ui.js')
        router = self.read('static/js/app-router.js')
        source_css = self.read('static/css/tailwind-input.css')
        built_css = self.read('static/css/tailwind.css')

        self.assertIn('const SEARCH_RESULT_BATCH_SIZE = 21', app_js)
        self.assertIn('function tmdbSearchMediaPage', app_js)
        self.assertIn('search/tv', app_js)
        self.assertIn('search/movie', app_js)
        self.assertIn('search/person', app_js)
        self.assertIn('replaceState({tvTrackerRoute:true}', app_js)
        self.assertIn('getSearchRoute(query="",media="tv")', app_js)
        self.assertIn('&type=${encodeURIComponent(cleanMedia)}', app_js)
        self.assertIn('currentSearchMediaType', router)
        self.assertIn('Start typing to search.', ui)
        self.assertNotIn('Browse TV shows, movies, and genres.', ui)
        self.assertNotIn('Results for ${escapeHTML(query)}', ui)
        self.assertNotIn('known_for_department ? String(result.known_for_department)', ui)
        self.assertIn('search-person-skeleton-card', source_css)
        self.assertIn('search-person-skeleton-card', built_css)


if __name__ == '__main__':
    unittest.main()
