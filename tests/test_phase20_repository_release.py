from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class T(unittest.TestCase):
 def test_release_docs_and_fonts(self):
  self.assertNotIn("Graphik",(ROOT/"static/css/tailwind-input.css").read_text());[self.assertTrue((ROOT/"docs"/n).exists()) for n in ["PRIVACY.md","TERMS.md","CREDITS.md","DEPLOYMENT.md"]]
