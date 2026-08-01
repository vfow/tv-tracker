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
        self.assertIn('1.7-title-modal-image-repair', template)

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

    def test_title_and_view_more_polish_exists(self):
        app_js = self.read('static/js/app.js')
        ui = self.read('static/js/ui.js')
        tmdb = self.read('static/js/tmdb.js')
        css = self.read('static/css/style.css')
        self.assertIn('romanized_title', app_js)
        self.assertIn('ROMANIZED_TITLE_VALIDATION_VERSION', app_js)
        self.assertIn('isLikelyUsefulRomanizedAlternative', app_js)
        self.assertIn('titleLooksLikeShortLoanwordReading', app_js)
        self.assertIn('titleLooksLikeEpisodeOrSpecialTitle', app_js)
        self.assertIn('titleLooksLikeUsefulOriginalRomanization', app_js)
        self.assertIn('clearRomanizedTitle', app_js)
        self.assertIn('isStoredRomanizedTitleDisplayable', app_js)
        self.assertIn('ensureRomanizedTitleForShow', app_js)
        self.assertIn('/alternative_titles', tmdb)
        self.assertIn('modal-title-subtitle', ui)
        self.assertIn('isStoredRomanizedTitleDisplayable(show)', ui)
        self.assertIn('View More', ui)
        self.assertIn('loadMoreSearchResults', app_js)
        self.assertIn('loadMoreDiscoverHubSection', app_js)
        self.assertIn('view-more-button', css)
        self.assertIn('tmdbMatch', ui)
        self.assertIn('requestedSize', ui)


if __name__ == '__main__':
    unittest.main()
