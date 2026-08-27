import os

# Production workers must never mutate the database schema while booting.
# Deployment applies migrations from the staged release before this module loads.
os.environ["TVTRACKER_SCHEMA_VERIFY_ONLY"] = "1"

import app as app_module
from tvtracker.notifications import push_and_movies as notifications_module
from tvtracker.notifications.runtime import prepare_final_notification_runtime
from tvtracker.notifications.push_validation import install_notification_polish
from tvtracker.infrastructure.static_assets import install_static_asset_versioning
from tvtracker.data_integrity import install_backup_summary_hardening

try:
    from tvtracker.infrastructure.observability import install_request_observability
except ModuleNotFoundError as error:
    # Keep rollback-compatible hermetic entrypoint tooling working when it models
    # the pre-observability package boundary. Other import failures remain fatal.
    if error.name != "tvtracker.infrastructure.observability":
        raise
    install_request_observability = None


app = app_module.app
database_connection = app_module.database_connection
fetch_tmdb_notification_json = app_module.fetch_tmdb_notification_json
login_required = app_module.login_required
check_csrf = app_module.check_csrf

prepare_final_notification_runtime(database_connection)
install_static_asset_versioning(app)
install_backup_summary_hardening(app)
install_notification_polish(app, notifications_module)
notifications_module.install_final_notifications(
    app,
    login_required=login_required,
    check_csrf=check_csrf,
    connection_factory=database_connection,
    tmdb_fetcher=fetch_tmdb_notification_json,
)
if (
    install_request_observability is not None
    and hasattr(app, "extensions")
    and callable(getattr(app, "before_request", None))
    and callable(getattr(app, "after_request", None))
):
    install_request_observability(
        app,
        release_sha=getattr(app_module, "RELEASE_SHA", None),
    )
application = app
