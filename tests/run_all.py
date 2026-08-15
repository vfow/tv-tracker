from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

subprocess.run(
    [sys.executable, "-m", "unittest", "discover", "-s", str(ROOT / "tests"), "-p", "test_*.py", "-v"],
    cwd=ROOT,
    check=True,
)

node = shutil.which("node")
if not node:
    raise SystemExit("Node.js is required for the frontend regression tests.")

for test_file in sorted((ROOT / "tests").glob("test_*.js")):
    subprocess.run([node, str(test_file)], cwd=ROOT, check=True)

print("All TV Tracker integration tests passed.")
