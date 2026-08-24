import argparse
import json
import unittest
from unittest.mock import patch

from tools import data_repair_report as repair


class FakeCursor:
    def __init__(self, store):
        self.store = store
        self.rowcount = 0
        self._last_sql = ""

    def execute(self, sql, params=()):
        self._last_sql = sql
        if "tv_tracker_schema_meta" in sql:
            self._result = [(self.store["schema_version"],)] if self.store.get("schema_version") is not None else []
            return
        if "tv_tracker_shows" in sql:
            if "UPDATE" in sql:
                show_id = params[-1]
                show = self.store["shows"].get(show_id)
                if show:
                    payload = params[0]
                    if isinstance(payload, str):
                        payload = json.loads(payload)
                    show["data"]["episodes_watched"] = payload
                    self.rowcount = 1
                return
            show_id = params[0]
            self._result = ([(self.store["shows"][show_id]["data"],)] if show_id in self.store["shows"] else [])
            return
        if "tv_tracker_history" in sql:
            if "UPDATE" in sql:
                target, entry_ids = params[0], list(params[1])
                matched = 0
                for eid in entry_ids:
                    row = next(r for r in self.store["history"] if r["entry_id"] == eid)
                    data = row["data"]
                    if (
                        data.get("tmdb_id") == repair.MONSTER_TMDB_ID
                        and int(data.get("season") or 0) > 1
                    ):
                        data["tmdb_id"] = target
                        matched += 1
                self.rowcount = matched
                return
            rows = []
            for row in self.store["history"]:
                data = row["data"]
                if "data->>'tmdb_id' = %s" in sql:
                    if data.get("tmdb_id") == repair.MONSTER_TMDB_ID and int(data.get("season") or 0) > 1:
                        rows.append((row["entry_id"], dict(data)))
                elif "'special'" in sql or "source_tvdb_episode_id" in sql:
                    if data.get("special") or "source_tvdb_episode_id" in data:
                        rows.append((row["entry_id"], dict(data)))
            self._result = rows
            return
        self._result = []

    def fetchone(self):
        return self._result[0] if self._result else None

    def fetchall(self):
        return self._result

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class FakeConn:
    def __init__(self, store):
        self.store = store
        self.closed = False

    def cursor(self):
        return FakeCursor(self.store)

    def transaction(self):
        return _FakeTransaction()

    def close(self):
        self.closed = True


class _FakeTransaction:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def build_store():
    return {
        "schema_version": 6,
        "shows": {
            "30981": {"data": {"tmdb_id": "30981", "number_of_seasons": 1, "episodes_watched": {"1": [1, 2, 3]}}},
            "10": {"data": {"tmdb_id": "10", "episodes_watched": {"1": [1, 2]}}},
        },
        "history": [
            {"entry_id": "good", "data": {"tmdb_id": "30981", "season": 1, "episode": 1, "title": "Episode One"}},
            {"entry_id": "suspect-a", "data": {"tmdb_id": "30981", "season": 2, "episode": 1, "title": "Blame It on the Rain"}},
            {"entry_id": "suspect-b", "data": {"tmdb_id": "30981", "season": 3, "episode": 8, "title": "The Godfather"}},
            {"entry_id": "other-show", "data": {"tmdb_id": "10", "season": 2, "episode": 1, "title": "Regular"}},
            {"entry_id": "special-collide", "data": {"tmdb_id": "10", "season": 1, "episode": 2, "special": True, "title": "Special"}},
            {"entry_id": "special-clear", "data": {"tmdb_id": "10", "season": 1, "episode": 9, "special": True, "title": "Special Two"}},
            {"entry_id": "movie", "data": {"media_type": "movie", "movie_id": "20", "tmdb_id": "20"}},
        ],
    }


class DataRepairToolTests(unittest.TestCase):
    def test_monster_suspects_matches_strict_signature_only(self):
        conn = FakeConn(build_store())
        suspects = repair.monster_suspects(conn)
        self.assertEqual([row["entry_id"] for row in suspects], ["suspect-a", "suspect-b"])
        self.assertEqual(suspects[0]["show_number_of_seasons"], 1)

    def test_remap_monster_rows_updates_only_matching_rows(self):
        store = build_store()
        conn = FakeConn(store)
        suspects = repair.monster_suspects(conn)
        count = repair.remap_monster_rows(conn, "286801", suspects)
        self.assertEqual(count, 2)
        good = next(r for r in store["history"] if r["entry_id"] == "good")
        other = next(r for r in store["history"] if r["entry_id"] == "other-show")
        self.assertEqual(good["data"]["tmdb_id"], "30981")
        self.assertEqual(other["data"]["tmdb_id"], "10")
        remapped = [r["data"]["tmdb_id"] for r in store["history"] if r["entry_id"].startswith("suspect")]
        self.assertEqual(remapped, ["286801", "286801"])

    def test_special_collisions_reports_only_colliding_coordinates(self):
        conn = FakeConn(build_store())
        findings = repair.special_collisions(conn)
        self.assertEqual([row["entry_id"] for row in findings], ["special-collide"])

    def test_remove_special_coordinates_preserves_other_progress(self):
        store = build_store()
        conn = FakeConn(store)
        findings = repair.special_collisions(conn)
        count = repair.remove_special_coordinates(conn, findings)
        self.assertEqual(count, 1)
        watched = store["shows"]["10"]["data"]["episodes_watched"]["1"]
        self.assertEqual(watched, [1])
        self.assertIn(2, store["shows"]["30981"]["data"]["episodes_watched"]["1"])

    def test_gates_refuse_without_confirm_or_backup(self):
        with self.assertRaises(SystemExit):
            repair.require_gates(argparse.Namespace(confirm="no", backup_verified=True))
        with self.assertRaises(SystemExit):
            repair.require_gates(argparse.Namespace(confirm="yes", backup_verified=False))

    def test_main_fails_closed_on_stale_schema(self):
        store = build_store()
        store["schema_version"] = 5
        with patch.object(repair, "open_connection", return_value=FakeConn(store)):
            with self.assertRaises(SystemExit):
                repair.main(["--repair-specials", "--confirm", "yes", "--backup-verified"])

    def test_main_fails_closed_without_schema_meta_table(self):
        store = build_store()
        store["schema_version"] = None
        with patch.object(repair, "open_connection", return_value=FakeConn(store)):
            with self.assertRaises(SystemExit):
                repair.main(["--repair-specials", "--confirm", "yes", "--backup-verified"])

    def test_main_report_only_never_mutates(self):
        store = build_store()
        before = json.dumps(store["history"], sort_keys=True)
        with patch.object(repair, "open_connection", return_value=FakeConn(store)):
            self.assertEqual(repair.main([]), 0)
        self.assertEqual(json.dumps(store["history"], sort_keys=True), before)

    def test_tmdb_candidates_uses_resolved_key_and_prints_ids(self):
        fake_results = {
            "results": [
                {"id": 30981, "name": "Monster", "first_air_date": "2004-04-07", "origin_country": ["JP"]},
                {"id": 113988, "name": "Monster", "first_air_date": "2022-09-21", "origin_country": ["US"]},
            ]
        }
        with patch.object(
            repair.reset_admin,
            "resolve_site_environment",
            return_value={"TMDB_API_KEY": "test-key"},
        ):
            candidates = repair.tmdb_tv_candidates("Monster", fetch=lambda url: fake_results)
        self.assertEqual(candidates[0]["id"], 30981)
        self.assertEqual(candidates[1]["id"], 113988)

    def test_tmdb_candidates_missing_key_is_safe(self):
        with patch.object(
            repair.reset_admin, "resolve_site_environment", return_value={}
        ):
            self.assertEqual(repair.tmdb_tv_candidates("Monster", fetch=lambda url: {}), [])


if __name__ == "__main__":
    unittest.main()
