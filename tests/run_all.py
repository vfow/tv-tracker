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
subprocess.run([node, str(ROOT / "tests" / "test_frontend.js")], cwd=ROOT, check=True)
print("All v1.3.1 Audit Repair tests passed.")
