# TV Tracker compatibility shim — canonical implementation lives in tvtracker.notifications.runtime.
from importlib import import_module as _import_module
import sys as _sys
_impl = _import_module("tvtracker.notifications.runtime")
_sys.modules[__name__] = _impl
