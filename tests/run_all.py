from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PYTHON_TEST_COMMAND = [
    sys.executable,
    "-m",
    "unittest",
    "discover",
    "-s",
    str(ROOT / "tests"),
    "-p",
    "test_*.py",
    "-v",
]
BROWSER_TEST_NAME = "test_real_browser_covers_login_redirect_and_authenticated_app_shell"


def run_python_suite():
    completed = subprocess.run(
        PYTHON_TEST_COMMAND,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        errors="replace",
        check=False,
    )
    output = completed.stdout or ""
    print(output, end="")
    return completed, output


def is_single_browser_timeout(output: str) -> bool:
    return all(
        marker in output
        for marker in (
            f"ERROR: {BROWSER_TEST_NAME}",
            "subprocess.TimeoutExpired",
            "FAILED (errors=1)",
        )
    )


python_result, python_output = run_python_suite()
if python_result.returncode:
    if not is_single_browser_timeout(python_output):
        raise subprocess.CalledProcessError(python_result.returncode, PYTHON_TEST_COMMAND)

    print("Retrying Python regression suite after isolated headless-browser timeout.")
    python_result, _python_output = run_python_suite()
    if python_result.returncode:
        raise subprocess.CalledProcessError(python_result.returncode, PYTHON_TEST_COMMAND)

node = shutil.which("node")
if not node:
    raise SystemExit("Node.js is required for the frontend regression tests.")

for test_file in sorted((ROOT / "tests").glob("test_*.js")):
    completed = subprocess.run([node, str(test_file)], cwd=ROOT, check=False)
    if completed.returncode:
        print(
            f"::error file={test_file.relative_to(ROOT)}::"
            f"Frontend regression failed after the Python suite: {test_file.name}"
        )
        raise subprocess.CalledProcessError(completed.returncode, [node, str(test_file)])

print("All TV Tracker integration tests passed.")
