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


if __name__ == "__main__":
    main()
