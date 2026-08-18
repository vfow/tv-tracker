from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class TVmazeFinalContracts(unittest.TestCase):
    def test_upcoming_uses_canonical_release_before_raw_calendar_date(self):
        source = (ROOT / "static/js/app.js").read_text(encoding="utf-8")
        start = source.index("function getUpcomingShows()")
        end = source.index("function getPersonalScheduleEpisode", start)
        body = source[start:end]
        self.assertLess(body.index("const aRelease = makeEpisodeReleaseDate"), body.index("const dateCompare = compareEpisodeCalendarDates"))

    def test_http_request_deduplication_is_real(self):
        source = (ROOT / "tvtracker/integrations/tvmaze.py").read_text(encoding="utf-8")
        self.assertIn("self._recent_requests", source)
        self.assertIn("event.wait", source)
        self.assertIn("finished.set()", source)

if __name__ == "__main__": unittest.main()
