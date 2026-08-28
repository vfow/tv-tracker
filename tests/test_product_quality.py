from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ProductQualitySourceTests(unittest.TestCase):
    def read(self, relative: str) -> str:
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_app_shell_has_accessible_landmarks_search_and_dialogs(self):
        template = self.read("templates/index.html")

        self.assertIn('<main class="main" id="app-main">', template)
        self.assertIn('<div class="content" id="show-list">', template)
        self.assertNotIn('<main class="content" id="show-list">', template)
        self.assertIn('aria-label="Show sections"', template)
        self.assertIn('aria-label="Search TV shows, movies, people, and collections"', template)
        self.assertIn('id="tv-tracker-startup-status" role="alert" aria-live="assertive"', template)
        self.assertIn('id="status-popup" aria-hidden="true"', template)
        self.assertIn('aria-labelledby="popup-title"', template)
        self.assertIn('id="show-modal" aria-hidden="true"', template)
        self.assertIn('aria-label="Show details"', template)
        self.assertIn('aria-label="Close details"', template)
        self.assertIn('id="favorites-popup" aria-hidden="true"', template)
        self.assertIn('aria-labelledby="favorites-popup-title"', template)
        self.assertGreaterEqual(template.count('role="dialog"'), 3)
        self.assertGreaterEqual(template.count('aria-modal="true"'), 3)
        self.assertIn("interaction-quality.js", template)
        self.assertLess(template.index("interaction-quality.js"), template.index("startup.js"))

    def test_login_requires_both_credentials_and_supports_keyboard_tabs(self):
        login = self.read("static/js/login.js")

        self.assertIn('usernameInput.value.trim().length > 0 && passwordInput.value.length > 0', login)
        self.assertNotIn('passwordInput.value.length >= 4', login)
        self.assertIn('input.addEventListener("input",updateSignInButton)', login)
        self.assertIn('tab.tabIndex = active ? 0 : -1;', login)
        self.assertIn('event.key === "ArrowRight"', login)
        self.assertIn('event.key === "ArrowLeft"', login)
        self.assertIn('event.key === "Home"', login)
        self.assertIn('event.key === "End"', login)

    def test_startup_failure_offers_an_explicit_reload_action(self):
        startup = self.read("static/js/startup.js")

        self.assertIn('data-startup-retry', startup)
        self.assertIn('button.textContent = "RELOAD APP"', startup)
        self.assertIn('global.location.reload()', startup)
        self.assertIn('installStartupRecovery();', startup)

    def test_dialog_quality_layer_restores_focus_and_traps_keyboard_navigation(self):
        quality = self.read("static/js/interaction-quality.js")

        self.assertIn('MutationObserver', quality)
        self.assertIn('event.key === "Escape"', quality)
        self.assertIn('event.key !== "Tab"', quality)
        self.assertIn('previousFocus', quality)
        self.assertIn('restorePreviousFocus', quality)
        self.assertIn('aria-hidden', quality)
        self.assertIn('aria-modal', quality)
        self.assertIn('closeStatusPopup', quality)
        self.assertIn('closeFavoritesPopup', quality)
        self.assertIn('closeShowModal', quality)
        self.assertIn('closeBehindEpisodesPopup', quality)


if __name__ == "__main__":
    unittest.main()
