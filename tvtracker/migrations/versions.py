"""Historical compatibility version for the immutable v1-v6 base registry.

The current application schema version is exported by ``tvtracker.migrations``
and is composed in ``registry_v7`` so already-applied v1-v6 SQL/checksums never
need to be rewritten.
"""

DATABASE_SCHEMA_VERSION = 6
