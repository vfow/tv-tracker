from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ReleaseTimingUIContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = (ROOT / "static/js/app.js").read_text()
        cls.ui = (ROOT / "static/js/ui.js").read_text()
        cls.release = (ROOT / "static/js/release-timing.js").read_text()
        cls.routes = (ROOT / "release_timing_routes.py").read_text()
        cls.resolver = (ROOT / "release_timing.py").read_text()

    def test_provider_has_no_extra_credit_ui(self):
        combined = "\n".join((self.release, self.routes, self.resolver))
        self.assertNotIn("Release timing data by", combined)
        self.assertFalse((ROOT / "static/css/release-timing.css").exists())

    def test_existing_upcoming_uses_canonical_release_timing(self):
        self.assertIn("makeEpisodeReleaseDate(a.episode.air_date,a.episode,a.show)", self.app)
        self.assertIn("getUpcomingGroup(missedEpisode.air_date,missedEpisode,show)", self.app)
        self.assertIn("getUpcomingTimeLabel(ep.air_date,ep,show)", self.app)
        self.assertIn("isEpisodeAired(airDate,episodeInfo,showInfo)", self.app)

    def test_watching_has_no_future_release_metadata(self):
        self.assertNotIn("const releaseMeta = nextEpisodeFuture", self.ui)
        self.assertNotIn("watchlist-release-meta", self.ui)
        self.assertIn("if(!isEpisodeLoggable(ep,show,season))", self.app)
        self.assertNotIn("const canonicalDayDifference = getDayDiffFromToday(ep.air_date,ep,show);", self.app)
        self.assertIn("const canLog = isEpisodeLoggable(ep,show,ep.season_number);", self.ui)
        self.assertIn("isEpisodeLoggable(nextEp,show,nextEp.season)", self.ui)

    def test_show_and_episode_surfaces_pass_show_identity_to_timing(self):
        self.assertIn("formatAirDate(ep.air_date,ep,show)", self.ui)
        self.assertIn("formatAirDate(episodeData.air_date,episodeData,show)", self.ui)
        self.assertIn("function formatAirDate(dateString,episodeInfo=null,showInfo=null)", self.app)
        self.assertIn("getEpisodeReleaseTimeText(\n        dateString,\n        episodeInfo,\n        showInfo", self.app)

    def test_caught_up_status_uses_release_moment(self):
        self.assertIn("const releaseDate = makeEpisodeReleaseDate(\n        nextEp.air_date,\n        nextEp,\n        show", self.app)

    def test_timing_prefetch_refreshes_existing_active_surfaces(self):
        self.assertIn('refreshCallback("timing")', self.release)
        self.assertIn('if(activeShowsTab === "watchlist")', self.app)
        self.assertIn("renderWatchlist();", self.app)
        self.assertIn('if(activePage === "show-detail"', self.app)
        self.assertIn('if(activePage === "episode-detail"', self.app)


if __name__ == "__main__":
    unittest.main()
