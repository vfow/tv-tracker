from pathlib import Path
import ast
import gzip
import json
import re
import time
import unicodedata
import unittest
from datetime import date, datetime, timedelta
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def load_network_helpers():
    source = (ROOT / "app.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    wanted_assignments = {
        "TMDB_NETWORK_EXPORT_LOOKBACK_DAYS",
        "TMDB_NETWORK_SEARCH_MAX_RESULTS",
    }
    wanted_functions = {
        "normalize_tmdb_network_search_text",
        "parse_tmdb_network_export_payload",
        "tmdb_network_export_candidate_dates",
        "search_tmdb_network_export",
    }
    selected = []
    for node in tree.body:
        if isinstance(node, ast.Assign):
            names = {
                target.id
                for target in node.targets
                if isinstance(target, ast.Name)
            }
            if names & wanted_assignments:
                selected.append(node)
        elif isinstance(node, ast.FunctionDef) and node.name in wanted_functions:
            selected.append(node)

    namespace = {
        "Any": Any,
        "date": date,
        "datetime": datetime,
        "gzip": gzip,
        "json": json,
        "re": re,
        "time": time,
        "timedelta": timedelta,
        "unicodedata": unicodedata,
    }
    module = ast.Module(body=selected, type_ignores=[])
    exec(compile(module, str(ROOT / "app.py"), "exec"), namespace)
    return namespace


class NetworkSearchHelperTests(unittest.TestCase):
    def setUp(self):
        self.helpers = load_network_helpers()

    def test_network_query_normalization_handles_brand_punctuation(self):
        normalize = self.helpers["normalize_tmdb_network_search_text"]
        self.assertEqual(normalize("Apple TV+"), "apple tv")
        self.assertEqual(normalize("  HBO®  "), "hbo")

    def test_export_date_waits_until_tmdb_daily_export_window(self):
        candidates = self.helpers["tmdb_network_export_candidate_dates"]
        self.assertEqual(candidates(datetime(2026, 8, 11, 7, 30))[0], date(2026, 8, 10))
        self.assertEqual(candidates(datetime(2026, 8, 11, 8, 30))[0], date(2026, 8, 11))

    def test_network_search_ranks_exact_normalized_matches_first(self):
        self.helpers["get_tmdb_network_export_records"] = lambda: ([
            {"id": 1, "name": "Apple TV+", "search_key": "apple tv"},
            {"id": 2, "name": "Apple TV", "search_key": "apple tv"},
            {"id": 3, "name": "HBO", "search_key": "hbo"},
            {"id": 4, "name": "Apple Television Network", "search_key": "apple television network"},
        ], "2026-08-11")
        search = self.helpers["search_tmdb_network_export"]
        results, source_date = search("Apple TV")
        self.assertEqual([item["id"] for item in results[:2]], [1, 2])
        self.assertEqual(source_date, "2026-08-11")

    def test_network_export_dedupes_by_id_not_name(self):
        parser = self.helpers["parse_tmdb_network_export_payload"]
        lines = "\n".join([
            json.dumps({"id": 1, "name": "A Network", "origin_country": "US"}),
            json.dumps({"id": 1, "name": "A Network duplicate", "origin_country": "US"}),
            json.dumps({"id": 2, "name": "A Network", "origin_country": "GB"}),
        ]).encode("utf-8")
        records = parser(gzip.compress(lines))
        self.assertEqual([item["id"] for item in records], [1, 2])
        self.assertEqual([item["name"] for item in records], ["A Network", "A Network"])


if __name__ == "__main__":
    unittest.main()
