from __future__ import annotations

import json
from collections import Counter
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from tvmaze_integration import TVMAZE_API_BASE, TVMAZE_USER_AGENT, classify_episode_timing


SHOWS = {
    "Game of Thrones": "tt0944947",
    "Stranger Things": "tt4574334",
    "The Last of Us": "tt3581920",
    "Severance": "tt11280740",
    "Arcane": "tt11126994",
}


def get(path: str, params=None):
    query = urlencode(params or {})
    req = Request(TVMAZE_API_BASE + path + (("?" + query) if query else ""), headers={"User-Agent": TVMAZE_USER_AGENT, "Accept":"application/json"})
    with urlopen(req, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    report = []
    totals = Counter()
    for label, imdb in SHOWS.items():
        show = get("/lookup/shows", {"imdb": imdb})
        episodes = get(f"/shows/{int(show['id'])}/episodes", {"specials": 1})
        counts = Counter()
        examples = {}
        season_zero = 0
        for episode in episodes:
            if int(episode.get("season") or -1) == 0:
                season_zero += 1
            result = classify_episode_timing(show, episode)
            precision = (result or {}).get("precision") or "unusable"
            counts[precision] += 1
            totals[precision] += 1
            examples.setdefault(precision, {
                "season": episode.get("season"), "episode": episode.get("number"),
                "airdate": episode.get("airdate"), "airtime": episode.get("airtime"),
                "airstamp": episode.get("airstamp"), "reason": (result or {}).get("reason", "")
            })
        channel = show.get("network") or show.get("webChannel") or {}
        report.append({
            "name": label,
            "tvmaze_id": show.get("id"),
            "channel": channel.get("name"),
            "channel_type": "network" if show.get("network") else "web",
            "country": (channel.get("country") or {}).get("code") if isinstance(channel.get("country"), dict) else None,
            "episodes": len(episodes),
            "season_zero": season_zero,
            "classification_counts": dict(counts),
            "examples": examples,
        })
    print(json.dumps({"shows": report, "totals": dict(totals)}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
