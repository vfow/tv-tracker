from app import (
    app,
    check_csrf,
    database_connection,
    fetch_tmdb_notification_json,
    login_required,
)
import final_notifications as final_notifications_module
from final_notifications_runtime import prepare_final_notification_runtime
from notification_polish_runtime import install_notification_polish
from static_asset_versioning import install_static_asset_versioning
from tvtracker.data_integrity import install_backup_summary_hardening

prepare_final_notification_runtime(database_connection)
install_static_asset_versioning(app)
install_backup_summary_hardening(app)
# Register before final_notifications so Flask's reverse after_request order
# injects notifications-final.js first and notifications-polish.js after it.
install_notification_polish(app, final_notifications_module)
final_notifications_module.install_final_notifications(
    app,
    login_required=login_required,
    check_csrf=check_csrf,
    connection_factory=database_connection,
    tmdb_fetcher=fetch_tmdb_notification_json,
)
application = app
