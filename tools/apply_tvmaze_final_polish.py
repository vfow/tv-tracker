from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path: str, old: str, new: str, *, count: int = 1) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if text.count(old) < count:
        raise RuntimeError(f"{path}: patch needle not found: {old[:140]!r}")
    target.write_text(text.replace(old, new, count), encoding="utf-8")


# Deduplicate simultaneous identical TVmaze requests and share the result for a
# short interval. This is intentionally in-memory only; durable provider caches
# still live in disposable provider tables.
replace(
    "tvmaze_integration.py",
    """        self._request_lock = threading.Lock()\n        self._inflight: dict[str, threading.Event] = {}\n        self.diagnostics = {""",
    """        self._request_lock = threading.Lock()\n        self._inflight: dict[str, threading.Event] = {}\n        self._recent_requests: dict[str, tuple[float, dict[str, Any] | None, Exception | None]] = {}\n        self.diagnostics = {""",
)
old_request = '''    def _request_json(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:\n        query = urlencode({key: value for key, value in (params or {}).items() if value is not None})\n        url = TVMAZE_API_BASE + path + (("?" + query) if query else "")\n        request = Request(url, headers={"Accept": "application/json", "User-Agent": TVMAZE_USER_AGENT})\n        last_error: Exception | None = None\n        for attempt in range(MAX_RETRIES + 1):\n            try:\n                self.diagnostics["requests"] += 1\n                with self.opener(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:\n                    payload = json.loads(response.read().decode("utf-8"))\n                return payload if isinstance(payload, dict) else None\n            except HTTPError as error:\n                if error.code == 404:\n                    return None\n                if error.code == 429 and attempt < MAX_RETRIES:\n                    self.diagnostics["rate_limited"] += 1\n                    self.sleep(self._retry_delay(error, attempt))\n                    continue\n                last_error = error\n                break\n            except (URLError, TimeoutError, OSError, json.JSONDecodeError, UnicodeDecodeError) as error:\n                last_error = error\n                break\n        self.diagnostics["failures"] += 1\n        if last_error:\n            raise RuntimeError("TVmaze request failed") from last_error\n        return None\n'''
new_request = '''    def _request_json_uncached(self, url: str) -> dict[str, Any] | None:\n        request = Request(url, headers={"Accept": "application/json", "User-Agent": TVMAZE_USER_AGENT})\n        last_error: Exception | None = None\n        for attempt in range(MAX_RETRIES + 1):\n            try:\n                self.diagnostics["requests"] += 1\n                with self.opener(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:\n                    payload = json.loads(response.read().decode("utf-8"))\n                return payload if isinstance(payload, dict) else None\n            except HTTPError as error:\n                if error.code == 404:\n                    return None\n                if error.code == 429 and attempt < MAX_RETRIES:\n                    self.diagnostics["rate_limited"] += 1\n                    self.sleep(self._retry_delay(error, attempt))\n                    continue\n                last_error = error\n                break\n            except (URLError, TimeoutError, OSError, json.JSONDecodeError, UnicodeDecodeError) as error:\n                last_error = error\n                break\n        self.diagnostics["failures"] += 1\n        if last_error:\n            raise RuntimeError("TVmaze request failed") from last_error\n        return None\n\n    def _request_json(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:\n        query = urlencode({key: value for key, value in (params or {}).items() if value is not None})\n        url = TVMAZE_API_BASE + path + (("?" + query) if query else "")\n        now = time.monotonic()\n        leader = False\n        with self._request_lock:\n            recent = self._recent_requests.get(url)\n            if recent and now - recent[0] <= 2.0:\n                _, payload, error = recent\n                if error is not None:\n                    raise RuntimeError("TVmaze request failed") from error\n                return payload\n            event = self._inflight.get(url)\n            if event is None:\n                event = threading.Event()\n                self._inflight[url] = event\n                leader = True\n\n        if not leader:\n            event.wait(timeout=(REQUEST_TIMEOUT_SECONDS * (MAX_RETRIES + 1)) + 8.0)\n            with self._request_lock:\n                recent = self._recent_requests.get(url)\n            if recent:\n                _, payload, error = recent\n                if error is not None:\n                    raise RuntimeError("TVmaze request failed") from error\n                return payload\n            raise RuntimeError("TVmaze request deduplication wait expired")\n\n        payload: dict[str, Any] | None = None\n        stored_error: Exception | None = None\n        try:\n            payload = self._request_json_uncached(url)\n            return payload\n        except RuntimeError as error:\n            stored_error = error\n            raise\n        finally:\n            with self._request_lock:\n                self._recent_requests[url] = (time.monotonic(), payload, stored_error)\n                finished = self._inflight.pop(url, None)\n                if finished is not None:\n                    finished.set()\n'''
replace("tvmaze_integration.py", old_request, new_request)

# Upcoming ordering follows the canonical release instant. Date-only fallback
# still naturally sorts at canonical local midnight; exact releases can cross a
# timezone date boundary without being forced back into the raw TMDB date order.
old_sort = '''        /*\n        Official TMDB calendar dates control schedule ordering and grouping.\n        Local-time conversion is only a time display/refinement within the same\n        official date and must never reorder July 28 ahead of July 27.\n        */\n        const dateCompare = compareEpisodeCalendarDates(\n            a.episode.air_date,\n            a.episode,\n            b.episode.air_date,\n            b.episode\n        );\n\n        if(dateCompare !== 0){\n            return dateCompare;\n        }\n\n        const aRelease = makeEpisodeReleaseDate(a.episode.air_date,a.episode,a.show);\n        const bRelease = makeEpisodeReleaseDate(b.episode.air_date,b.episode,b.show);\n\n        if(aRelease && bRelease && aRelease.getTime() !== bRelease.getTime()){\n            return aRelease - bRelease;\n        }\n'''
new_sort = '''        const aRelease = makeEpisodeReleaseDate(a.episode.air_date,a.episode,a.show);\n        const bRelease = makeEpisodeReleaseDate(b.episode.air_date,b.episode,b.show);\n\n        if(aRelease && bRelease && aRelease.getTime() !== bRelease.getTime()){\n            return aRelease - bRelease;\n        }\n\n        const dateCompare = compareEpisodeCalendarDates(\n            a.episode.air_date,\n            a.episode,\n            b.episode.air_date,\n            b.episode\n        );\n        if(dateCompare !== 0){ return dateCompare; }\n'''
replace("static/js/app.js", old_sort, new_sort)

old_future_sort = '''        const dateCompare = compareEpisodeCalendarDates(\n            a.air_date,\n            a,\n            b.air_date,\n            b\n        );\n\n        if(dateCompare !== 0){\n            return dateCompare;\n        }\n\n        const aRelease = makeEpisodeReleaseDate(a.air_date,a,show);\n        const bRelease = makeEpisodeReleaseDate(b.air_date,b,show);\n\n        if(aRelease && bRelease && aRelease.getTime() !== bRelease.getTime()){\n            return aRelease - bRelease;\n        }\n'''
new_future_sort = '''        const aRelease = makeEpisodeReleaseDate(a.air_date,a,show);\n        const bRelease = makeEpisodeReleaseDate(b.air_date,b,show);\n\n        if(aRelease && bRelease && aRelease.getTime() !== bRelease.getTime()){\n            return aRelease - bRelease;\n        }\n\n        const dateCompare = compareEpisodeCalendarDates(a.air_date,a,b.air_date,b);\n        if(dateCompare !== 0){ return dateCompare; }\n'''
replace("static/js/app.js", old_future_sort, new_future_sort)

replace(
    "static/js/app.js",
    "const dayDifference = getDayDiffFromToday(airDate,sourceEpisode);",
    "const dayDifference = getDayDiffFromToday(airDate,sourceEpisode,show);",
)
replace(
    "static/js/app.js",
    "const diffDays = getDayDiffFromToday(episode.air_date,episode);",
    "const diffDays = getDayDiffFromToday(episode.air_date,episode,show);",
)

old_month = '''    const airDate = makeLocalDate(\n        getEpisodeCalendarDateString(airDateString,episodeInfo)\n    );\n\n    const today = new Date();\n    today.setHours(0,0,0,0);\n\n    if(\n        airDate &&\n        airDate.getFullYear() === today.getFullYear() &&\n        airDate.getMonth() === today.getMonth()\n    ){\n        return "This Month";\n    }\n'''
new_month = '''    const canonicalDateString = window.TVTrackerReleaseTiming && typeof window.TVTrackerReleaseTiming.calendarDate === "function"\n        ? window.TVTrackerReleaseTiming.calendarDate(airDateString,episodeInfo,showInfo)\n        : getEpisodeCalendarDateString(airDateString,episodeInfo);\n    const airDate = makeLocalDate(canonicalDateString);\n    const effectiveTimezone = window.TVTrackerReleaseTiming && typeof window.TVTrackerReleaseTiming.getStatus === "function"\n        ? String(window.TVTrackerReleaseTiming.getStatus().timezone || "")\n        : "";\n    let today = new Date();\n    if(effectiveTimezone){\n        try{\n            const todayString = new Intl.DateTimeFormat("en-CA",{timeZone:effectiveTimezone,year:"numeric",month:"2-digit",day:"2-digit"})\n                .formatToParts(today)\n                .reduce((parts,part)=>{ if(part.type !== "literal"){ parts[part.type] = part.value; } return parts; },{});\n            today = makeLocalDate(`${todayString.year}-${todayString.month}-${todayString.day}`) || today;\n        }catch(error){ /* local-device fallback */ }\n    }\n    today.setHours(0,0,0,0);\n\n    if(airDate && airDate.getFullYear() === today.getFullYear() && airDate.getMonth() === today.getMonth()){\n        return "This Month";\n    }\n'''
replace("static/js/app.js", old_month, new_month)

# Strengthen provider unit tests with true concurrent request deduplication.
test_path = ROOT / "tests/test_tvmaze_integration.py"
test_text = test_path.read_text(encoding="utf-8")
test_text = test_text.replace("import io\nimport json\nimport unittest", "import io\nimport json\nimport threading\nimport time\nimport unittest")
needle = '''    def test_external_id_conflict_is_rejected(self):\n        provider = self.provider(lambda *args,**kwargs: FakeResponse({}))\n        provider._request_json = mock.Mock(side_effect=[{"id":10},{"id":11}])\n        tvmaze_id, reason = provider._lookup_external(imdb_id="tt1",tvdb_id=123)\n        self.assertIsNone(tvmaze_id)\n        self.assertEqual(reason,"external_id_conflict")\n'''
addition = needle + '''\n    def test_identical_concurrent_requests_are_deduplicated(self):\n        calls = []\n        started = threading.Event()\n        def opener(*args, **kwargs):\n            calls.append(1)\n            started.set()\n            time.sleep(0.08)\n            return FakeResponse({"id": 77})\n        provider = self.provider(opener)\n        results = []\n        def run():\n            results.append(provider._request_json("/shows/77"))\n        first = threading.Thread(target=run)\n        second = threading.Thread(target=run)\n        first.start()\n        started.wait(timeout=1)\n        second.start()\n        first.join(timeout=2)\n        second.join(timeout=2)\n        self.assertEqual(results, [{"id":77},{"id":77}])\n        self.assertEqual(len(calls), 1)\n'''
if needle not in test_text:
    raise RuntimeError("TVmaze concurrency test insertion point missing")
test_path.write_text(test_text.replace(needle, addition), encoding="utf-8")

# Source contract guards the final canonical-ordering behavior.
contract = ROOT / "tests/test_tvmaze_final_contracts.py"
contract.write_text('''from pathlib import Path\nimport unittest\n\nROOT = Path(__file__).resolve().parents[1]\n\nclass TVmazeFinalContracts(unittest.TestCase):\n    def test_upcoming_uses_canonical_release_before_raw_calendar_date(self):\n        source = (ROOT / "static/js/app.js").read_text(encoding="utf-8")\n        start = source.index("function getUpcomingShows()")\n        end = source.index("function getPersonalScheduleEpisode", start)\n        body = source[start:end]\n        self.assertLess(body.index("const aRelease = makeEpisodeReleaseDate"), body.index("const dateCompare = compareEpisodeCalendarDates"))\n\n    def test_http_request_deduplication_is_real(self):\n        source = (ROOT / "tvmaze_integration.py").read_text(encoding="utf-8")\n        self.assertIn("self._recent_requests", source)\n        self.assertIn("event.wait", source)\n        self.assertIn("finished.set()", source)\n\nif __name__ == "__main__": unittest.main()\n''', encoding="utf-8")

print("Final TVmaze timing polish patches applied.")
