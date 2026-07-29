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
        self.assertIn('1.7-candidate', template)

    def test_backend_proxy_is_tmdb_only(self):
        app_py = self.read('app.py')
        self.assertIn('/api/tmdb/<path:tmdb_path>', app_py)
        self.assertNotIn('api.' + 'tv' + 'maze.com', app_py)

    def test_legacy_metadata_cleanup_exists(self):
        app_py = self.read('app.py')
        app_js = self.read('static/js/app.js')
        self.assertIn('clean_legacy_metadata', app_py)
        self.assertIn('cleanLegacyMetadata', app_js)


if __name__ == '__main__':
    unittest.main()
