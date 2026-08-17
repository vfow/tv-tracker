from app import (
    app,
    check_csrf,
    database_connection,
    fetch_tmdb_notification_json,
    login_required,
)
import final_notifications as final_notifications_module
from final_notifications_runtime import prepare_final_notification_runtime
from static_asset_versioning import install_static_asset_versioning

prepare_final_notification_runtime(database_connection)
install_static_asset_versioning(app)
final_notifications_module.install_final_notifications(
    app,
    login_required=login_required,
    check_csrf=check_csrf,
    connection_factory=database_connection,
    tmdb_fetcher=fetch_tmdb_notification_json,
)
application = app
