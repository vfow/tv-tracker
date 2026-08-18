from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SHIM_MARKER = "# TV Tracker compatibility shim — canonical implementation moved during architecture cleanup."


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def ensure_package(path: str) -> None:
    target = ROOT / path / "__init__.py"
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        target.write_text("\"\"\"TV Tracker application package.\"\"\"\n", encoding="utf-8")


def module_shim(target: str) -> str:
    return f'''{SHIM_MARKER}\nfrom importlib import import_module as _import_module\nimport sys as _sys\n\n_impl = _import_module({target!r})\n_sys.modules[__name__] = _impl\n'''


def source_for_migration(path: str) -> str:
    source = read(path)
    if source.startswith(SHIM_MARKER):
        raise RuntimeError(f"{path} is already a compatibility shim; canonical source cannot be reconstructed")
    return source


def replace_exact(source: str, old: str, new: str, *, path: str, required: bool = True) -> str:
    count = source.count(old)
    if count == 0:
        if required:
            raise RuntimeError(f"Expected text not found in {path}: {old!r}")
        return source
    return source.replace(old, new)


def migrate_module(src: str, dst: str, module_name: str, transform) -> None:
    dst_path = ROOT / dst
    src_text = read(src)
    if src_text.startswith(SHIM_MARKER):
        if not dst_path.exists():
            raise RuntimeError(f"Missing canonical module {dst} for existing shim {src}")
        return
    canonical = transform(src_text)
    write(dst, canonical)
    write(src, module_shim(module_name))


def main() -> None:
    for package in (
        "tvtracker",
        "tvtracker/notifications",
        "tvtracker/release_timing",
        "tvtracker/integrations",
        "tvtracker/infrastructure",
    ):
        ensure_package(package)

    migrate_module(
        "notification_engine.py",
        "tvtracker/notifications/engine.py",
        "tvtracker.notifications.engine",
        lambda source: source,
    )

    def transform_release_timing(source: str) -> str:
        source = source.replace('importlib.import_module("tvmaze_integration")', 'importlib.import_module("tvtracker.integrations.tvmaze")')
        return source

    migrate_module(
        "release_timing.py",
        "tvtracker/release_timing/service.py",
        "tvtracker.release_timing.service",
        transform_release_timing,
    )

    def transform_backend(source: str) -> str:
        source = replace_exact(
            source,
            "from release_timing import (",
            "from tvtracker.release_timing.service import (",
            path="notifications_backend.py",
        )
        source = replace_exact(
            source,
            "from notification_engine import (",
            "from tvtracker.notifications.engine import (",
            path="notifications_backend.py",
        )
        return source

    migrate_module(
        "notifications_backend.py",
        "tvtracker/notifications/backend.py",
        "tvtracker.notifications.backend",
        transform_backend,
    )

    def transform_push_movies(source: str) -> str:
        return replace_exact(
            source,
            "from notifications_backend import (",
            "from tvtracker.notifications.backend import (",
            path="final_notifications.py",
        )

    migrate_module(
        "final_notifications.py",
        "tvtracker/notifications/push_and_movies.py",
        "tvtracker.notifications.push_and_movies",
        transform_push_movies,
    )

    def transform_runtime(source: str) -> str:
        source = re.sub(
            r"^import final_notifications as ([A-Za-z_][A-Za-z0-9_]*)$",
            r"from tvtracker.notifications import push_and_movies as \1",
            source,
            flags=re.MULTILINE,
        )
        source = source.replace(
            "from final_notifications import ",
            "from tvtracker.notifications.push_and_movies import ",
        )
        return source

    migrate_module(
        "final_notifications_runtime.py",
        "tvtracker/notifications/runtime.py",
        "tvtracker.notifications.runtime",
        transform_runtime,
    )

    migrate_module(
        "notification_polish_runtime.py",
        "tvtracker/notifications/push_validation.py",
        "tvtracker.notifications.push_validation",
        lambda source: source,
    )

    def transform_routes(source: str) -> str:
        source = source.replace(
            "from release_timing import ",
            "from tvtracker.release_timing.service import ",
        )
        source = source.replace(
            "import release_timing",
            "from tvtracker.release_timing import service as release_timing",
        )
        return source

    migrate_module(
        "release_timing_routes.py",
        "tvtracker/release_timing/routes.py",
        "tvtracker.release_timing.routes",
        transform_routes,
    )

    migrate_module(
        "tvmaze_integration.py",
        "tvtracker/integrations/tvmaze.py",
        "tvtracker.integrations.tvmaze",
        lambda source: source,
    )

    migrate_module(
        "static_asset_versioning.py",
        "tvtracker/infrastructure/static_assets.py",
        "tvtracker.infrastructure.static_assets",
        lambda source: source,
    )

    app = read("app.py")
    app = app.replace(
        "from notifications_backend import (",
        "from tvtracker.notifications.backend import (",
    )
    write("app.py", app)

    wsgi = read("wsgi.py")
    wsgi = wsgi.replace(
        "import final_notifications as final_notifications_module",
        "from tvtracker.notifications import push_and_movies as final_notifications_module",
    )
    wsgi = wsgi.replace(
        "from final_notifications_runtime import prepare_final_notification_runtime",
        "from tvtracker.notifications.runtime import prepare_final_notification_runtime",
    )
    wsgi = wsgi.replace(
        "from notification_polish_runtime import install_notification_polish",
        "from tvtracker.notifications.push_validation import install_notification_polish",
    )
    wsgi = wsgi.replace(
        "from static_asset_versioning import install_static_asset_versioning",
        "from tvtracker.infrastructure.static_assets import install_static_asset_versioning",
    )
    write("wsgi.py", wsgi)

    worker = read("notification_worker.py")
    worker = worker.replace(
        "from notifications_backend import ",
        "from tvtracker.notifications.backend import ",
    )
    worker = worker.replace(
        "from final_notifications_runtime import ",
        "from tvtracker.notifications.runtime import ",
    )
    write("notification_worker.py", worker)

    # Update project-owned imports in tests so monkeypatches and private helper tests
    # target the canonical modules rather than compatibility shims.
    replacements = {
        "import notification_engine": "from tvtracker.notifications import engine as notification_engine",
        "from notification_engine import ": "from tvtracker.notifications.engine import ",
        "import notifications_backend": "from tvtracker.notifications import backend as notifications_backend",
        "from notifications_backend import ": "from tvtracker.notifications.backend import ",
        "import final_notifications as": "from tvtracker.notifications import push_and_movies as",
        "import final_notifications\n": "from tvtracker.notifications import push_and_movies as final_notifications\n",
        "from final_notifications import ": "from tvtracker.notifications.push_and_movies import ",
        "from final_notifications_runtime import ": "from tvtracker.notifications.runtime import ",
        "from notification_polish_runtime import ": "from tvtracker.notifications.push_validation import ",
        "import release_timing\n": "from tvtracker.release_timing import service as release_timing\n",
        "from release_timing import ": "from tvtracker.release_timing.service import ",
        "from release_timing_routes import ": "from tvtracker.release_timing.routes import ",
        "import tvmaze_integration\n": "from tvtracker.integrations import tvmaze as tvmaze_integration\n",
        "from tvmaze_integration import ": "from tvtracker.integrations.tvmaze import ",
        "from static_asset_versioning import ": "from tvtracker.infrastructure.static_assets import ",
    }
    for test_path in sorted((ROOT / "tests").glob("test_*.py")):
        source = test_path.read_text(encoding="utf-8")
        updated = source
        for old, new in replacements.items():
            updated = updated.replace(old, new)
        if updated != source:
            test_path.write_text(updated, encoding="utf-8")

    tvmaze_doc = ROOT / "TVMAZE.md"
    if tvmaze_doc.exists():
        docs_target = ROOT / "docs" / "TVMAZE.md"
        docs_target.parent.mkdir(parents=True, exist_ok=True)
        docs_target.write_text(tvmaze_doc.read_text(encoding="utf-8"), encoding="utf-8")
        tvmaze_doc.unlink()

    write(
        "docs/architecture/ARCHITECTURE_MIGRATION.md",
        """# TV Tracker Architecture Migration\n\n"
        "This branch performs the whole-system stabilization and future-proofing batch.\n\n"
        "## Safety order\n\n"
        "1. Owner and user safety/security.\n"
        "2. User-data integrity and recoverability.\n"
        "3. Backward compatibility and production reliability.\n"
        "4. UX/accessibility and product requirements.\n"
        "5. Architecture and repository cleanliness.\n\n"
        "## Wave 1: canonical package boundaries\n\n"
        "The first implementation wave is intentionally behavior-preserving. Notification, release-timing, integration and infrastructure implementations move under the `tvtracker` package while temporary root compatibility shims keep older imports safe during the transition. Production entrypoints import the canonical package directly.\n\n"
        "No tracker-state schema, backup format, route, Push behavior, TMDB identity rule or notification behavior is intentionally changed in this wave.\n\n"
        "Compatibility shims are transitional and must be removed only after all callers and source-contract tests target canonical modules.\n"
        """,
    )

    # Guard against accidental duplicate implementations in the migrated domains.
    expected = [
        "tvtracker/notifications/engine.py",
        "tvtracker/notifications/backend.py",
        "tvtracker/notifications/push_and_movies.py",
        "tvtracker/notifications/runtime.py",
        "tvtracker/notifications/push_validation.py",
        "tvtracker/release_timing/service.py",
        "tvtracker/release_timing/routes.py",
        "tvtracker/integrations/tvmaze.py",
        "tvtracker/infrastructure/static_assets.py",
    ]
    for relative in expected:
        path = ROOT / relative
        if not path.exists() or path.stat().st_size == 0:
            raise RuntimeError(f"Canonical architecture module missing: {relative}")


if __name__ == "__main__":
    main()
