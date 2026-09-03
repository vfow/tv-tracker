from __future__ import annotations

import importlib
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from tvtracker import auth
from tvtracker.auth import registration_policy


ROOT = Path(__file__).resolve().parents[1]
ARCHITECTURE_DOC = ROOT / "docs" / "architecture" / "MULTI_USER_PHASE1_ARCHITECTURE_LOCK.md"


class MultiUserPhase1ArchitectureTests(unittest.TestCase):
    def test_public_registration_is_source_locked_closed(self):
        self.assertFalse(registration_policy.PUBLIC_REGISTRATION_ENABLED)
        self.assertEqual(registration_policy.PUBLIC_REGISTRATION_OPEN_PHASE, 8)
        self.assertEqual(
            registration_policy.PUBLIC_REGISTRATION_POLICY,
            "closed_until_phase_8_acceptance",
        )
        self.assertFalse(registration_policy.public_registration_enabled())

        with patch.dict(
            os.environ,
            {
                "PUBLIC_REGISTRATION_ENABLED": "1",
                "REGISTRATION_ENABLED": "true",
            },
            clear=False,
        ):
            reloaded = importlib.reload(registration_policy)
            self.assertFalse(reloaded.public_registration_enabled())

    def test_auth_domain_exports_registration_gate(self):
        self.assertFalse(auth.PUBLIC_REGISTRATION_ENABLED)
        self.assertEqual(auth.PUBLIC_REGISTRATION_OPEN_PHASE, 8)
        self.assertFalse(auth.public_registration_enabled())

    def test_phase_1_does_not_expose_signup_routes(self):
        routes = (ROOT / "tvtracker" / "web" / "routes.py").read_text(encoding="utf-8")
        for route in ("/signup", "/register"):
            self.assertNotIn(f'@app.get("{route}")', routes)
            self.assertNotIn(f'@app.post("{route}")', routes)
        self.assertFalse((ROOT / "templates" / "signup.html").exists())
        self.assertFalse((ROOT / "templates" / "register.html").exists())

    def test_legacy_admin_remains_intact_for_safe_migration(self):
        security = (ROOT / "tvtracker" / "auth" / "security.py").read_text(encoding="utf-8")
        recovery = (ROOT / "tools" / "reset_admin.py").read_text(encoding="utf-8")
        self.assertIn("FROM tv_tracker_admin", security)
        self.assertIn("def read_admin_account", security)
        self.assertIn("def upsert_admin_account", recovery)
        self.assertIn("tv_tracker_admin", recovery)

    def test_architecture_lock_covers_user_owned_boundaries_and_rollout(self):
        document = ARCHITECTURE_DOC.read_text(encoding="utf-8")

        for decision in (
            "immutable UUID",
            "3-30 characters",
            "30-day recovery window",
            "Reactivate Account",
            "Cancel Account Deletion",
            "TOTP",
            "Sign Out All Devices",
            "registration remains closed",
            "authenticated session",
            "AlwaysData",
        ):
            self.assertIn(decision, document)

        for relation in (
            "tv_tracker_shows",
            "tv_tracker_history",
            "tv_tracker_state",
            "tv_tracker_meta",
            "tv_tracker_changes",
            "tv_tracker_notification_settings",
            "tv_tracker_notification_baseline",
            "tv_tracker_notification_events",
            "tv_tracker_notifications",
            "tv_tracker_final_notification_settings",
            "tv_tracker_movie_notification_baseline",
            "tv_tracker_push_subscriptions",
            "tv_tracker_push_presence",
            "tv_tracker_push_deliveries",
            "tv_tracker_security_events",
            "tv_tracker_admin",
        ):
            self.assertIn(f"`{relation}`", document)

        for state_key in (
            "profile",
            "movies",
            "metadata_sync",
            "network_sync",
            "import_info",
            "provider_metadata",
        ):
            self.assertIn(f"`{state_key}`", document)

        for phase in range(1, 9):
            self.assertIn(f"{phase}. **", document)


if __name__ == "__main__":
    unittest.main()
