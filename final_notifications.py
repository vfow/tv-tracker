# TV Tracker compatibility shim — canonical implementation lives in tvtracker.notifications.push_and_movies.
from importlib import import_module as _import_module
import sys as _sys
_impl = _import_module("tvtracker.notifications.push_and_movies")
_sys.modules[__name__] = _impl
