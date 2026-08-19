from app import (
    app,
    check_csrf,
    database_connection,
    fetch_tmdb_notification_json,
    login_required,
)
from tvtracker.notifications import push_and_movies as notifications_module
from tvtracker.notifications.runtime import prepare_final_notification_runtime
from tvtracker.notifications.push_validation import install_notification_polish
from tvtracker.infrastructure.static_assets import install_static_asset_versioning
from tvtracker.data_integrity import install_backup_summary_hardening

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
application = app
