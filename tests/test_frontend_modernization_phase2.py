import json
import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FrontendModernizationPhase2Tests(unittest.TestCase):
    def test_vue_vite_typescript_toolchain_is_locked(self):
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertFalse(package.get("dependencies"))
        self.assertEqual(package["devDependencies"]["vue"], "3.5.41")
        self.assertEqual(package["devDependencies"]["vite"], "7.3.6")
        self.assertEqual(package["devDependencies"]["@vitejs/plugin-vue"], "6.0.8")
        self.assertEqual(package["devDependencies"]["typescript"], "6.0.3")
        self.assertEqual(package["devDependencies"]["vue-tsc"], "3.3.10")
        self.assertIn("frontend:typecheck", package["scripts"])
        self.assertIn("frontend:build", package["scripts"])

        lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
        self.assertEqual(lock["packages"]["node_modules/vue"]["version"], "3.5.41")
        self.assertTrue(lock["packages"]["node_modules/vue"].get("dev"))
        self.assertEqual(lock["packages"]["node_modules/vite"]["version"], "7.3.6")
        self.assertEqual(lock["packages"]["node_modules/typescript"]["version"], "6.0.3")

    def test_vite_output_is_hashed_committed_and_manifest_driven(self):
        manifest = json.loads((ROOT / "static/vue/manifest.json").read_text(encoding="utf-8"))
        entry = manifest["frontend/src/main.ts"]
        self.assertTrue(entry["isEntry"])
        self.assertRegex(entry["file"], r"^assets/main-[A-Za-z0-9_-]+\.js$")
        bundle = ROOT / "static/vue" / entry["file"]
        self.assertTrue(bundle.is_file())
        self.assertGreater(bundle.stat().st_size, 10_000)

        main_source = (ROOT / "frontend/src/main.ts").read_text(encoding="utf-8")
        self.assertIn(
            "FRONTEND_FOUNDATION_LINEAGE = 'phase2-vue-foundation'",
            main_source,
            "Phase 2 must remain the recorded lineage for later incremental migrations",
        )
        version_match = re.search(
            r"FRONTEND_FOUNDATION_VERSION\s*=\s*'([^']+)'",
            main_source,
        )
        self.assertIsNotNone(
            version_match,
            "The Vue entry must declare the active incremental migration version",
        )
        active_version = version_match.group(1)
        self.assertIn(
            active_version,
            bundle.read_text(encoding="utf-8"),
            "The committed bundle marker should match the active migration version declared by source",
        )

        template = (ROOT / "templates/index.html").read_text(encoding="utf-8")
        self.assertNotIn("static/vue/", template)
        self.assertNotIn("FRONTEND_FOUNDATION_VERSION", template)

    def test_typed_api_boundary_is_same_origin_and_csrf_guarded(self):
        client = (ROOT / "frontend/src/api/client.ts").read_text(encoding="utf-8")
        self.assertIn("path.startsWith('/api/')", client)
        self.assertIn("X-CSRF-Token", client)
        self.assertIn("credentials: 'same-origin'", client)
        self.assertIn("X-Request-ID", client)

    def test_architecture_decision_formally_reopens_only_frontend_lock(self):
        decision = (ROOT / "docs/architecture/FRONTEND_MODERNIZATION_DECISION_2026-08-28.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("supersedes **L-04 Frontend**", decision)
        self.assertIn("Vue 3 + Vite + TypeScript", decision)
        self.assertIn("does not mount Vue", decision)
        self.assertIn("All other Phase 11", decision)

    def test_frontend_build_is_reproducible(self):
        subprocess.run(["npm", "run", "build:frontend"], cwd=ROOT, check=True)
        subprocess.run(
            ["git", "diff", "--exit-code", "--", "static/vue"],
            cwd=ROOT,
            check=True,
        )


if __name__ == "__main__":
    unittest.main()
