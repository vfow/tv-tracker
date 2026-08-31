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
