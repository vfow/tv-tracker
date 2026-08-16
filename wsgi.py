from app import (
    app,
    check_csrf,
    database_connection,
    fetch_tmdb_notification_json,
    login_required,
)
from final_notifications import install_final_notifications
from static_asset_versioning import install_static_asset_versioning

install_static_asset_versioning(app)
install_final_notifications(
    app,
    login_required=login_required,
    check_csrf=check_csrf,
    connection_factory=database_connection,
    tmdb_fetcher=fetch_tmdb_notification_json,
)
application = app
