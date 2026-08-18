from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app.py"
SETTINGS_PATHS = {
    "/app/settings/profile",
    "/app/settings/auth",
    "/app/settings/notifications",
    "/app/settings/streaming",
    "/app/settings/data",
    "/app/settings/danger-zone",
}


def patch_stale_contracts() -> None:
    """Move regression assertions to the canonical Wave 2 owners/contracts."""
    notification_path = ROOT / "tests/test_notification_contract.py"
    notification = notification_path.read_text(encoding="utf-8")
    notification = notification.replace(
        "assert 'id=\"notification-settings-page\"' in template\n",
        "assert 'id=\"notification-settings-page\"' not in template\n"
        "assert '/app/settings/notifications' in router\n",
    )
    notification_path.write_text(notification, encoding="utf-8")

    source_path = ROOT / "tests/test_source_contracts.py"
    source = source_path.read_text(encoding="utf-8")
    source = source.replace(
        "        ui = self.read('static/js/ui.js')\n"
        "        self.assertIn('profile-header-${preset}', ui)\n",
        "        settings = self.read('static/js/settings.js')\n"
        "        self.assertIn('profile-header-${preset}', settings)\n",
    )
    source_path.write_text(source, encoding="utf-8")

    runtime_path = ROOT / "tests/test_notification_polish_runtime.py"
    runtime = runtime_path.read_text(encoding="utf-8")
    runtime = runtime.replace(
        "    def test_push_config_response_exposes_only_safe_mismatch_diagnostic(self) -> None:\n",
        "    def test_push_config_response_hides_mismatch_diagnostics(self) -> None:\n",
    )
    runtime = runtime.replace(
        '        self.assertEqual(payload["diagnostic"], "keypair_mismatch")\n'
        '        self.assertNotIn("privateKey", payload)\n'
        '        self.assertNotIn("validationError", payload)\n',
        '        self.assertTrue(payload["unavailable"])\n'
        '        self.assertNotIn("diagnostic", payload)\n'
        '        self.assertNotIn("privateKey", payload)\n'
        '        self.assertNotIn("validationError", payload)\n'
        '        self.assertNotIn("validationCode", payload)\n'
        '        self.assertNotIn("dependencyAvailable", payload)\n',
    )
    runtime_path.write_text(runtime, encoding="utf-8")


def main() -> None:
    text = APP.read_text(encoding="utf-8")

    # Do not make generic route validation depend on a new module-level regex.
    # Several backend tests deliberately replace route-regex globals to exercise
    # refresh-safe routing, and explicit canonical Settings paths are clearer here.
    text = text.replace(
        'APP_SETTINGS_PATH_RE = re.compile(r"^/app/settings/(profile|auth|notifications|streaming|data|danger-zone)$")\n',
        "",
    )
    text = text.replace(
        "        or APP_SETTINGS_PATH_RE.fullmatch(cleaned_path) is not None\n",
        "        or cleaned_path in SETTINGS_SECTION_PATHS\n",
    )

    anchor = 'APP_SECTION_PATHS = {\n'
    if "SETTINGS_SECTION_PATHS = {" not in text:
        index = text.find(anchor)
        if index < 0:
            raise RuntimeError("APP_SECTION_PATHS anchor missing")
        end = text.find("}\n", index)
        if end < 0:
            raise RuntimeError("APP_SECTION_PATHS end missing")
        end += 2
        block = "\nSETTINGS_SECTION_PATHS = {\n" + "".join(
            f'    "{path}",\n' for path in sorted(SETTINGS_PATHS)
        ) + "}\n"
        text = text[:end] + block + text[end:]

    text = text.replace(
        "        if APP_SETTINGS_PATH_RE.fullmatch(requested_path) is None:\n            abort(404)\n",
        "        if requested_path not in SETTINGS_SECTION_PATHS:\n            abort(404)\n",
    )

    if "APP_SETTINGS_PATH_RE" in text:
        raise RuntimeError("APP_SETTINGS_PATH_RE remained after hardening")
    if "SETTINGS_SECTION_PATHS" not in text:
        raise RuntimeError("Canonical Settings route set was not installed")

    APP.write_text(text, encoding="utf-8")
    patch_stale_contracts()


if __name__ == "__main__":
    main()
