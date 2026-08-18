from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, path: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}: {old!r}; found {count}")
    return text.replace(old, new, 1)


def transform_template() -> None:
    path = "templates/index.html"
    text = read(path)
    if "settings-v2.css" not in text:
        text = replace_once(
            text,
            '<link rel="stylesheet" href="{{ url_for(\'static\', filename=\'css/tailwind.css\') }}">',
            '<link rel="stylesheet" href="{{ url_for(\'static\', filename=\'css/tailwind.css\') }}">\n<link rel="stylesheet" href="{{ url_for(\'static\', filename=\'css/settings-v2.css\') }}">\n<link rel="stylesheet" href="{{ url_for(\'static\', filename=\'css/feedback.css\') }}">',
            path,
        )
    if "js/feedback.js" not in text:
        text = replace_once(
            text,
            '<script src="{{ url_for(\'static\', filename=\'js/ui.js\') }}"></script>',
            '<script src="{{ url_for(\'static\', filename=\'js/ui.js\') }}"></script>\n<script src="{{ url_for(\'static\', filename=\'js/feedback.js\') }}"></script>',
            path,
        )
    if "js/adult-filter.js" not in text:
        text = replace_once(
            text,
            '<script src="{{ url_for(\'static\', filename=\'js/app.js\') }}"></script>',
            '<script src="{{ url_for(\'static\', filename=\'js/app.js\') }}"></script>\n<script src="{{ url_for(\'static\', filename=\'js/adult-filter.js\') }}"></script>',
            path,
        )
    if "js/settings.js" not in text:
        text = replace_once(
            text,
            '<script src="{{ url_for(\'static\', filename=\'js/streaming-region.js\') }}"></script>',
            '<script src="{{ url_for(\'static\', filename=\'js/streaming-region.js\') }}"></script>\n<script src="{{ url_for(\'static\', filename=\'js/settings.js\') }}"></script>',
            path,
        )
    # The old standalone Notification Settings DOM surface is obsolete. The legacy
    # route now redirects to Account Settings > Notifications.
    old_block = '''\n<!-- NOTIFICATION SETTINGS PAGE -->\n\n<div id="notification-settings-page" class="page notification-settings-page">\n    <div id="notification-settings-content"></div>\n</div>\n\n'''
    text = text.replace(old_block, "\n")
    write(path, text)


def transform_app_py() -> None:
    path = "app.py"
    text = read(path)
    if "APP_SETTINGS_PATH_RE" not in text:
        text = replace_once(
            text,
            'APP_COLLECTIONS_PATH_RE = re.compile(r"^/app/collections$")',
            'APP_COLLECTIONS_PATH_RE = re.compile(r"^/app/collections$")\nAPP_SETTINGS_PATH_RE = re.compile(r"^/app/settings/(profile|auth|notifications|streaming|data|danger-zone)$")',
            path,
        )
    text = text.replace('    "/app/notifications/settings",\n', "")

    allowed_old = '        "avatar_data", "header_type", "header_preset", "header_image", "streaming_region",\n'
    allowed_new = '        "avatar_data", "header_type", "header_preset", "header_image", "streaming_region", "adult_filter",\n'
    if allowed_old in text:
        text = replace_once(text, allowed_old, allowed_new, path)

    normalization_anchor = '''    profile["streaming_region"] = streaming_region\n\n    if profile.get("avatar_type") not in (None, "", "initial", "preset", "upload"):\n'''
    if 'profile["adult_filter"]' not in text:
        normalization_new = '''    profile["streaming_region"] = streaming_region\n\n    adult_filter = profile.get("adult_filter", True)\n    if not isinstance(adult_filter, bool):\n        raise BackupValidationError("Profile field adult_filter is invalid")\n    profile["adult_filter"] = adult_filter\n\n    if profile.get("avatar_type") not in (None, "", "initial", "preset", "upload"):\n'''
        text = replace_once(text, normalization_anchor, normalization_new, path)

    default_anchor = '''                "avatar_preset": "silhouette-1",\n                "avatar_data": "",\n            },\n'''
    if '"adult_filter": True' not in text:
        default_new = '''                "avatar_preset": "silhouette-1",\n                "avatar_data": "",\n                "adult_filter": True,\n            },\n'''
        text = replace_once(text, default_anchor, default_new, path)

    text = text.replace('    @app.get("/app/notifications/settings", strict_slashes=False)\n', "")

    section_body = '''    def app_section_page():\n        requested_path = request.path.rstrip("/")\n        if requested_path not in APP_SECTION_PATHS:\n            abort(404)\n        if request.path != requested_path:\n            return redirect_app_path_preserving_query(requested_path)\n        return render_app_shell(requested_path)\n\n\n'''
    if "def app_settings_section_page" not in text:
        section_new = '''    def app_section_page():\n        requested_path = request.path.rstrip("/")\n        if requested_path not in APP_SECTION_PATHS:\n            abort(404)\n        if requested_path == "/app/settings":\n            return redirect_app_path_preserving_query("/app/settings/profile")\n        if request.path != requested_path:\n            return redirect_app_path_preserving_query(requested_path)\n        return render_app_shell(requested_path)\n\n    @app.get("/app/settings/<settings_section>", strict_slashes=False)\n    @login_required\n    def app_settings_section_page(settings_section: str):\n        requested_path = request.path.rstrip("/")\n        if APP_SETTINGS_PATH_RE.fullmatch(requested_path) is None:\n            abort(404)\n        if request.path != requested_path:\n            return redirect_app_path_preserving_query(requested_path)\n        return render_app_shell(requested_path)\n\n    @app.get("/app/notifications/settings", strict_slashes=False)\n    @login_required\n    def legacy_notification_settings_page():\n        return redirect_app_path_preserving_query("/app/settings/notifications")\n\n\n'''
        text = replace_once(text, section_body, section_new, path)
    write(path, text)


def transform_app_js() -> None:
    path = "static/js/app.js"
    text = read(path)
    profile_anchor = '''        avatar_type:"initial",\n        avatar_preset:"silhouette-1",\n        avatar_data:""\n'''
    if "adult_filter:true" not in text[:1000]:
        text = replace_once(
            text,
            profile_anchor,
            '''        avatar_type:"initial",\n        avatar_preset:"silhouette-1",\n        avatar_data:"",\n        adult_filter:true\n''',
            path,
        )
    write(path, text)


def transform_ui() -> None:
    path = "static/js/ui.js"
    text = read(path)
    start = text.find("function renderSettings(){")
    end = text.find("function renderMetadataSyncPanel(){", start)
    if start < 0 or end < 0:
        raise RuntimeError("Could not locate legacy renderSettings block")
    block = text[start:end]
    if "Simkl / Trakt Export Later" in block:
        replacement = '''function renderSettings(){\n\n    if(window.TVTrackerSettings && typeof window.TVTrackerSettings.render === "function"){\n        return window.TVTrackerSettings.render();\n    }\n\n    const settings = document.getElementById("settings-content");\n    if(settings){\n        settings.innerHTML = `<div class="settings-v2"><div class="settings-v2-loading" role="status" aria-label="Loading settings"><div class="settings-v2-skeleton-line"></div><div class="settings-v2-skeleton-line"></div><div class="settings-v2-skeleton-line"></div></div></div>`;\n    }\n\n}\n\n'''
        text = text[:start] + replacement + text[end:]
    write(path, text)


def transform_router() -> None:
    path = "static/js/app-router.js"
    text = read(path)
    if "SETTINGS_SECTIONS" not in text:
        text = replace_once(
            text,
            '    const SHOW_TABS = new Set(["watchlist","upcoming","history"]);',
            '    const SHOW_TABS = new Set(["watchlist","upcoming","history"]);\n    const SETTINGS_SECTIONS = new Set(["profile","auth","notifications","streaming","data","danger-zone"]);',
            path,
        )

    old_parse = '''        if(path === "/app/settings"){\n            return buildParsedRoute("settings",path,"",{});\n        }\n        if(path === "/app/notifications"){\n            return buildParsedRoute("notifications",path,"",{});\n        }\n        if(path === "/app/notifications/settings"){\n            return buildParsedRoute("notification-settings",path,"",{});\n        }\n'''
    if old_parse in text:
        new_parse = '''        if(path === "/app/settings"){\n            return buildParsedRoute("settings","/app/settings/profile","",{section:"profile"});\n        }\n        const settingsMatch = path.match(/^\\/app\\/settings\\/(profile|auth|notifications|streaming|data|danger-zone)$/);\n        if(settingsMatch && SETTINGS_SECTIONS.has(settingsMatch[1])){\n            return buildParsedRoute("settings",path,"",{section:settingsMatch[1]});\n        }\n        if(path === "/app/notifications"){\n            return buildParsedRoute("notifications",path,"",{});\n        }\n        if(path === "/app/notifications/settings"){\n            return buildParsedRoute("settings","/app/settings/notifications","",{section:"notifications",legacy:true});\n        }\n'''
        text = replace_once(text, old_parse, new_parse, path)

    old_initial = '''        if(parsed.type === "notification-settings"){\n            activePage = "notification-settings";\n            setPageActiveWithoutRender("notification-settings-page","shows");\n            if(typeof updateShellTitle === "function"){ updateShellTitle(); }\n            return;\n        }\n        if(parsed.type === "profile" || parsed.type === "settings"){\n            activePage = parsed.type;\n            setPageActiveWithoutRender(parsed.type + "-page",parsed.type);\n            if(typeof updateShellTitle === "function"){\n                updateShellTitle();\n            }\n            return;\n        }\n'''
    if old_initial in text:
        new_initial = '''        if(parsed.type === "profile"){\n            activePage = "profile";\n            setPageActiveWithoutRender("profile-page","profile");\n            if(typeof updateShellTitle === "function"){ updateShellTitle(); }\n            return;\n        }\n        if(parsed.type === "settings"){\n            activePage = "settings";\n            setPageActiveWithoutRender("settings-page","settings");\n            if(globalThis.TVTrackerSettings && typeof globalThis.TVTrackerSettings.open === "function"){\n                globalThis.TVTrackerSettings.open(params.section || "profile",{fromRoute:true,skipShowPage:true});\n            }\n            if(typeof updateShellTitle === "function"){ updateShellTitle(); }\n            return;\n        }\n'''
        text = replace_once(text, old_initial, new_initial, path)

    old_apply_notification = '''        if(parsed.type === "notification-settings"){\n            clearDetailState();\n            if(\n                window.TVTrackerNotifications &&\n                typeof window.TVTrackerNotifications.openNotificationSettingsPage === "function"\n            ){\n                window.TVTrackerNotifications.openNotificationSettingsPage({fromRoute:true});\n            }\n            return;\n        }\n'''
    text = text.replace(old_apply_notification, "")

    old_apply_settings = '''        if(parsed.type === "settings"){\n            clearDetailState();\n            showPage("settings");\n            return;\n        }\n'''
    if old_apply_settings in text:
        new_apply_settings = '''        if(parsed.type === "settings"){\n            clearDetailState();\n            if(window.TVTrackerSettings && typeof window.TVTrackerSettings.open === "function"){\n                window.TVTrackerSettings.open(params.section || "profile",{fromRoute:true});\n            }else{\n                showPage("settings");\n            }\n            return;\n        }\n'''
        text = replace_once(text, old_apply_settings, new_apply_settings, path)
    write(path, text)


def transform_notifications_js() -> None:
    path = "static/js/notifications.js"
    text = read(path).replace("/app/notifications/settings", "/app/settings/notifications")
    write(path, text)


def transform_tests() -> None:
    # Source-contract tests follow the canonical Settings owner rather than the removed legacy renderer.
    path = "tests/test_source_contracts.py"
    text = read(path)
    text = text.replace("ui = self.read('static/js/ui.js')\n        self.assertNotIn('Metadata ' + 'Source', ui)", "ui = self.read('static/js/ui.js')\n        settings = self.read('static/js/settings.js')\n        self.assertNotIn('Metadata ' + 'Source', settings)")
    text = text.replace("self.assertIn('Export or import a full backup.', ui)", "self.assertIn('Export, import, or create a readable report', settings)")
    text = text.replace("self.assertNotIn('Export or import a full backup of this tracker.', ui)", "self.assertNotIn('Simkl / Trakt', settings)")
    if '@app.get("/app/settings/<settings_section>", strict_slashes=False)' not in text:
        text = text.replace(
            "self.assertIn('@app.get(\"/app/settings\", strict_slashes=False)', app_py)",
            "self.assertIn('@app.get(\"/app/settings\", strict_slashes=False)', app_py)\n        self.assertIn('@app.get(\"/app/settings/<settings_section>\", strict_slashes=False)', app_py)\n        self.assertIn('/app/settings/notifications', router)",
        )
    write(path, text)

    # Notification follow-up tests should enforce the new canonical route and no technical diagnostics.
    for relative in ("tests/test_settings_notifications_followup.js", "tests/test_notifications_polish_runtime.js"):
        test_path = ROOT / relative
        if not test_path.exists():
            continue
        source = test_path.read_text(encoding="utf-8")
        source = source.replace('/app/notifications/settings', '/app/settings/notifications')
        source = source.replace('PUSH_DIAGNOSTIC_MESSAGES', 'CANONICAL_SETTINGS_ROUTE')
        test_path.write_text(source, encoding="utf-8")


def main() -> None:
    transform_template()
    transform_app_py()
    transform_app_js()
    transform_ui()
    transform_router()
    transform_notifications_js()
    transform_tests()


if __name__ == "__main__":
    main()
