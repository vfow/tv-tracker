from pathlib import Path
import subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
subprocess.run([sys.executable,"tests/run_all.py"],cwd=ROOT,check=True)
print("TV Tracker release-candidate torture gate passed.")
