import source_contracts_base as source_contracts


class TMDBOnlyContractTests(source_contracts.TMDBOnlyContractTests):
    def test_discover_description_and_view_more_polish_exists(self):
        search_vue = self.read('frontend/src/search-discover/SearchResults.vue')
        css = self.read('static/css/tailwind-input.css')
        app_js = self.read('static/js/app.js')
        tmdb_js = self.read('static/js/tmdb.js')
        self.assertIn('VIEW MORE', search_vue)
        self.assertIn('loadMoreSearchResults', app_js)
        self.assertIn('loadMoreDiscoverSection', app_js)
        self.assertIn('-webkit-line-clamp:2', css)
        self.assertIn('view-more-button', css)
        self.assertIn('tmdbSearchShowsPage', tmdb_js)

    def test_phase51_search_routing_polish_exists(self):
        app_js = self.read('static/js/app.js')
        ui = self.read('static/js/ui.js')
        router = self.read('static/js/app-router.js')
        source_css = self.read('static/css/tailwind-input.css')
        built_css = self.read('static/css/tailwind.css')
        search_vue = self.read('frontend/src/search-discover/SearchResults.vue')

        self.assertIn('const SEARCH_RESULT_BATCH_SIZE = 21', app_js)
        self.assertIn('function tmdbSearchMediaPage', app_js)
        self.assertIn('search/tv', app_js)
        self.assertIn('search/movie', app_js)
        self.assertIn('search/person', app_js)
        self.assertIn('replaceState({tvTrackerRoute:true}', router)
        self.assertIn('getSearchRoute(query="",media="tv")', app_js)
        self.assertIn('&type=${encodeURIComponent(cleanMedia)}', app_js)
        self.assertIn('currentSearchMediaType', router)
        self.assertIn('Start typing to search.', search_vue)
        self.assertNotIn('Browse TV shows, movies, and genres.', ui)
        self.assertNotIn('Results for ${escapeHTML(query)}', ui)
        self.assertNotIn('known_for_department ? String(result.known_for_department)', ui)
        self.assertIn('search-person-skeleton-card', search_vue)
        self.assertIn('search-person-skeleton-card', source_css)
        self.assertIn('tt-skeleton-poster', search_vue)
        self.assertIn('.tt-skeleton-poster{', built_css)
