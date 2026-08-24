"""Production data-repair reporting tool for known Phase 3 data-integrity findings.

Read-only by default. Any repair requires:
  * ``--confirm yes`` (explicit operator confirmation)
  * ``--backup-verified`` (operator confirms a fresh backup exists)
  * a current database schema version (fail closed)

Known repairs:
  1. ``monster`` -- the 17 historical episode records wrongly attached to
     ``Monster`` (2004, TMDB 30981) as seasons 2/3. Their episode titles belong
     to a different source. Remap only records matching the strict signature.
  2. ``specials`` -- imported specials that were stored as regular
     ``episodes_watched`` coordinates. Removes the colliding coordinates only;
     history records themselves are never deleted.

This tool never deletes history rows.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from tvtracker.database.connection import connect_database
from tvtracker.migrations import DATABASE_SCHEMA_VERSION

MONSTER_TMDB_ID = "30981"


def read_schema_version(conn: Any) -> int | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT schema_version FROM tv_tracker_schema_meta ORDER BY id DESC LIMIT 1"
        )
        row = cur.fetchone()
    return int(row[0]) if row else None


def read_show_data(conn: Any, show_id: str) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT data FROM tv_tracker_shows WHERE show_id = %s", (show_id,)
        )
        row = cur.fetchone()
    return row[0] if row else None


def history_rows(conn: Any, where: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT entry_id, data FROM tv_tracker_history WHERE {where} "
            "ORDER BY entry_id",
            params,
        )
        rows = [{"entry_id": r[0], "data": r[1]} for r in cur.fetchall()]
    return rows


def monster_suspects(conn: Any) -> list[dict[str, Any]]:
    rows = history_rows(
        conn,
        "data->>'tmdb_id' = %s AND COALESCE((data->>'season')::int, 0) > 1",
        (MONSTER_TMDB_ID,),
    )
    show = read_show_data(conn, MONSTER_TMDB_ID)
    for row in rows:
        row["show_number_of_seasons"] = (
            show.get("number_of_seasons") if show else None
        )
    return rows


def remap_monster_rows(
    conn: Any, target_tmdb_id: str, suspects: list[dict[str, Any]]
) -> int:
    if not suspects:
        return 0
    entry_ids = [row["entry_id"] for row in suspects]
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE tv_tracker_history "
                "SET data = data || jsonb_build_object('tmdb_id', %s), "
                "updated_at = now() "
                "WHERE entry_id = ANY(%s) "
                "AND data->>'tmdb_id' = %s "
                "AND COALESCE((data->>'season')::int, 0) > 1",
                (target_tmdb_id, entry_ids, MONSTER_TMDB_ID),
            )
            return cur.rowcount


def special_collisions(conn: Any) -> list[dict[str, Any]]:
    rows = history_rows(
        conn,
        "COALESCE((data->>'special')::boolean, false) = true "
        "OR data ? 'source_tvdb_episode_id'",
        (),
    )
    findings: list[dict[str, Any]] = []
    for row in rows:
        data = row["data"]
        tmdb_id = str(data.get("tmdb_id") or "")
        season = data.get("season")
        episode = data.get("episode")
        if not tmdb_id or season is None or episode is None or int(season) < 1:
            continue
        show = read_show_data(conn, tmdb_id)
        if not show:
            continue
        watched = (show.get("episodes_watched") or {}).get(str(season)) or []
        if episode in watched:
            row["collides_with_regular_progress"] = True
            findings.append(row)
    return findings


def remove_special_coordinates(conn: Any, findings: list[dict[str, Any]]) -> int:
    removed = 0
    by_show: dict[str, set[tuple[int, int]]] = {}
    for row in findings:
        key = str(row["data"].get("tmdb_id") or "")
        by_show.setdefault(key, set()).add(
            (int(row["data"]["season"]), int(row["data"]["episode"]))
        )
    with conn.transaction():
        for show_id, coordinates in by_show.items():
            show = read_show_data(conn, show_id)
            if not show:
                continue
            watched = dict(show.get("episodes_watched") or {})
            changed = False
            for season, episode in coordinates:
                season_key = str(season)
                values = [v for v in (watched.get(season_key) or []) if v != episode]
                if len(values) != len(watched.get(season_key) or []):
                    changed = True
                watched[season_key] = values
                removed += 1
            if changed:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE tv_tracker_shows "
                        "SET data = data || jsonb_build_object("
                        "'episodes_watched', %s::jsonb), updated_at = now() "
                        "WHERE show_id = %s",
                        (json.dumps(watched), show_id),
                    )
    return removed


def print_report(
    schema_version: int | None, monsters: list[dict[str, Any]], specials: list[dict[str, Any]]
) -> None:
    print(f"Database schema version : {schema_version} "
          f"(expected {DATABASE_SCHEMA_VERSION})")
    print(f"Monster suspects (tmdb_id={MONSTER_TMDB_ID}, season>1) : "
          f"{len(monsters)}")
    for row in monsters:
        data = row["data"]
        print(
            "  -",
            row["entry_id"],
            f"S{data.get('season')}E{data.get('episode')}",
            repr(data.get("title") or ""),
            f"(show number_of_seasons={row['show_number_of_seasons']})",
        )
    print(f"Special progress collisions : {len(specials)}")
    for row in specials:
        data = row["data"]
        print(
            "  -",
            row["entry_id"],
            f"tmdb_id={data.get('tmdb_id')} S{data.get('season')}E{data.get('episode')}",
            repr(data.get("title") or ""),
        )


def require_gates(args: argparse.Namespace) -> None:
    if args.confirm != "yes":
        raise SystemExit("refusing repair: pass --confirm yes")
    if not args.backup_verified:
        raise SystemExit("refusing repair: pass --backup-verified after a fresh backup")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repair-monster",
        metavar="TARGET_TMDB_ID",
        help="remap Monster (30981) season>1 history rows to TARGET_TMDB_ID",
    )
    parser.add_argument(
        "--repair-specials",
        action="store_true",
        help="remove special-colliding coordinates from regular episodes_watched",
    )
    parser.add_argument("--confirm", help="literal 'yes' required for any repair")
    parser.add_argument(
        "--backup-verified",
        action="store_true",
        help="operator confirms a fresh backup exists",
    )
    args = parser.parse_args(argv)

    conn = connect_database()
    try:
        schema_version = read_schema_version(conn)
        monsters = monster_suspects(conn)
        specials = special_collisions(conn)
        print_report(schema_version, monsters, specials)

        if args.repair_monster or args.repair_specials:
            require_gates(args)
            if schema_version != DATABASE_SCHEMA_VERSION:
                raise SystemExit(
                    "refusing repair: database schema is not current "
                    f"({schema_version} != {DATABASE_SCHEMA_VERSION})"
                )
        if args.repair_monster:
            count = remap_monster_rows(conn, args.repair_monster, monsters)
            print(f"Remapped {count} Monster history rows to {args.repair_monster}")
        if args.repair_specials:
            count = remove_special_coordinates(conn, specials)
            print(f"Removed {count} special-colliding regular progress coordinates")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
