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
    return completed, output


def print_python_failure(output: str):
    lines = output.splitlines()
    failure_starts = [
        index
        for index, line in enumerate(lines)
        if line.startswith(("FAIL: ", "ERROR: "))
    ]
    start = failure_starts[0] if failure_starts else max(0, len(lines) - 80)
    excerpt = "\n".join(lines[start:])
    print("DIAG_FAIL:PYTHON")
    print(excerpt)


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
        print_python_failure(python_output)
        raise subprocess.CalledProcessError(python_result.returncode, PYTHON_TEST_COMMAND)

    print("Retrying Python regression suite after isolated headless-browser timeout.")
    python_result, python_output = run_python_suite()
    if python_result.returncode:
        print_python_failure(python_output)
        raise subprocess.CalledProcessError(python_result.returncode, PYTHON_TEST_COMMAND)

node = shutil.which("node")
if not node:
    raise SystemExit("Node.js is required for the frontend regression tests.")

for test_file in sorted((ROOT / "tests").glob("test_*.js")):
    completed = subprocess.run(
        [node, str(test_file)],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        errors="replace",
        check=False,
    )
    if completed.returncode:
        print(f"DIAG_FAIL:JS:{test_file.name}")
        print(completed.stdout or "")
        raise subprocess.CalledProcessError(completed.returncode, [node, str(test_file)])

print("All TV Tracker integration tests passed.")
