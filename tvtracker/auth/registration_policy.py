from __future__ import annotations

"""Multi-user rollout gate.

Public registration is intentionally closed while the account system is built,
migrated, and accepted.  Phases 1 through 7 must not make this configurable via
environment variables or deployment settings.  Phase 8 is the only phase that
may deliberately change this policy after the complete production acceptance
gate passes.
"""

PUBLIC_REGISTRATION_ENABLED = False
PUBLIC_REGISTRATION_OPEN_PHASE = 8
PUBLIC_REGISTRATION_POLICY = "closed_until_phase_8_acceptance"


def public_registration_enabled() -> bool:
    """Return whether unauthenticated visitors may create accounts.

    This deliberately returns the source-controlled rollout constant rather
    than consulting the environment.  That prevents an incomplete deployment
    from accidentally exposing registration before Phase 8 acceptance.
    """

    return PUBLIC_REGISTRATION_ENABLED
