from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class DocumentationLicenseContractTests(unittest.TestCase):
    def test_repository_has_explicit_restrictive_license_notice(self):
        license_text = (ROOT / "LICENSE").read_text(encoding="utf-8")
        self.assertIn("All rights reserved.", license_text)
        self.assertIn("No permission is granted", license_text)

    def test_licensing_policy_prevents_automated_open_source_relicensing(self):
        policy = (ROOT / "docs" / "LICENSING.md").read_text(encoding="utf-8")
        self.assertIn("no open-source license grant", policy.lower())
        self.assertIn("must be an explicit repository-owner decision", policy)


if __name__ == "__main__":
    unittest.main()
