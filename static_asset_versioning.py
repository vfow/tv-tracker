# TV Tracker compatibility shim — canonical implementation lives in tvtracker.infrastructure.static_assets.
from importlib import import_module as _import_module
import sys as _sys
_impl = _import_module("tvtracker.infrastructure.static_assets")
_sys.modules[__name__] = _impl
