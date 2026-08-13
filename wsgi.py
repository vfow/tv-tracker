from app import app
from static_asset_versioning import install_static_asset_versioning

install_static_asset_versioning(app)
application = app
