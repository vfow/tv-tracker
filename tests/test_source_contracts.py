class TMDBOnlyContractTests(unittest.TestCase):
    def test_phase601_movie_layout_search_state_and_person_roles_exist(self):
        app_js = self.read('static/js/app.js')
        ui = self.read('static/js/ui.js')
        css = self.read('static/css/tailwind-input.css')
        error_template = self.read('templates/error.html')
        self.assertIn('movie-page-hero-shell', ui)
        self.assertIn('movie-page-identity-row', ui)
        self.assertIn('modal-hero show-detail-hero show-page-hero movie-page-hero', ui)
        self.assertIn('pushExplicitDetailBackRoute', app_js)
        self.assertIn('backRoute:backRoute', ui)
        self.assertIn('getPersonCreditRoleLabel', app_js)
        self.assertIn('person_role_label', app_js)
        self.assertIn('Actor: ', app_js)
        self.assertIn('width:min(640px,48vw)', css)
        self.assertIn('width:min(640px,48vw)', error_template)

    def test_production_company_logos_and_movie_financial_rows_removed(self):
        ui = self.read('static/js/ui.js')
        self.assertIn('company && company.logo_path', ui)
        self.assertIn('trackerImageURL(logoPath,"w185")', ui)
        self.assertIn('network-logo-chip', ui)
        self.assertIn('aria-label="${escapeHTML(name)}"', ui)
        self.assertNotIn('>Budget</div>', ui)
        self.assertNotIn('>Revenue</div>', ui)
        self.assertNotIn('function formatMovieMoney', ui)

if __name__ == '__main__':
    unittest.main()
