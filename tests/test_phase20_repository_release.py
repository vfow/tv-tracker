from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class T(unittest.TestCase):
    def test_release_docs_and_fonts(self):
        for relative in (
            "static/css/tailwind-input.css",
            "static/css/tailwind.css",
        ):
            css = (ROOT / relative).read_text(encoding="utf-8").casefold()
            self.assertNotIn("graphik", css, relative)

        font_suffixes = {".eot", ".otf", ".ttf", ".woff", ".woff2"}
        font_assets = [
            path
            for path in (ROOT / "static" / "assets").rglob("*")
            if path.is_file() and path.suffix.casefold() in font_suffixes
        ]
        for font_asset in font_assets:
            relative = font_asset.relative_to(ROOT).as_posix()
            self.assertNotIn("graphik", relative.casefold(), relative)
            payload = font_asset.read_bytes().lower()
            for encoding in ("ascii", "utf-16-le", "utf-16-be"):
                self.assertNotIn("graphik".encode(encoding), payload, relative)

        for name in ("PRIVACY.md", "TERMS.md", "CREDITS.md", "DEPLOYMENT.md"):
            self.assertTrue((ROOT / "docs" / name).exists(), name)
