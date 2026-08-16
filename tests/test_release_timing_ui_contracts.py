from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ReleaseTimingUIContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = (ROOT / "static/js/app.js").read_text()
        cls.ui = (ROOT / "static/js/ui.js").read_text()
        cls.release = (ROOT / "static/js/release-timing.js").read_text()
        cls.release_css = (ROOT / "static/css/release-timing.css").read_text()

    def test_attribution_cannot_become_a_root_flex_column(self):
        self.assertIn('document.querySelector(".main") || document.body', self.release)
        self.assertIn('container.style.position = "fixed"', self.release)
        self.assertIn(".release-timing-attribution-root", self.release_css)
        self.assertIn("position:fixed", self.release_css)
        self.assertNotIn('mountAttribution(document.getElementById("app") || document.body)', self.release)

    def test_existing_upcoming_and_watchlist_use_canonical_release_timing(self):
        self.assertIn("makeEpisodeReleaseDate(a.episode.air_date,a.episode,a.show)", self.app)
        self.assertIn("getUpcomingGroup(missedEpisode.air_date,missedEpisode,show)", self.app)
        self.assertIn("getUpcomingTimeLabel(ep.air_date,ep,show)", self.app)
        self.assertIn("isEpisodeAired(airDate,episodeInfo,showInfo)", self.app)
        self.assertIn("formatAirDate(nextEp.air_date,nextEp,show)", self.ui)
        self.assertIn("getCountdownText(nextEp.air_date,nextEp,show)", self.ui)

    def test_show_and_episode_surfaces_pass_show_identity_to_timing(self):
        self.assertIn("formatAirDate(ep.air_date,ep,show)", self.ui)
        self.assertIn("formatAirDate(episodeData.air_date,episodeData,show)", self.ui)
        self.assertIn("function formatAirDate(dateString,episodeInfo=null,showInfo=null)", self.app)
        self.assertIn("getEpisodeReleaseTimeText(\n        dateString,\n        episodeInfo,\n        showInfo", self.app)

    def test_caught_up_status_uses_release_moment_not_raw_tmdb_day(self):
        self.assertIn("const releaseDate = makeEpisodeReleaseDate(\n        nextEp.air_date,\n        nextEp,\n        show", self.app)
        self.assertNotIn("getEpisodeCalendarDateString(nextEp.air_date,nextEp)", self.app)

    def test_timing_prefetch_refreshes_the_existing_active_surface(self):
        self.assertIn('refreshCallback("timing")', self.release)
        self.assertIn('if(activeShowsTab === "watchlist")', self.app)
        self.assertIn("renderWatchlist();", self.app)
        self.assertIn('if(activePage === "show-detail"', self.app)
        self.assertIn('if(activePage === "episode-detail"', self.app)


if __name__ == "__main__":
    unittest.main()
