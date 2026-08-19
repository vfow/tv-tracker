from __future__ import annotations

import subprocess
from pathlib import Path

import phase14_23_batch as batch

ROOT = Path(__file__).resolve().parents[1]


def custom_phase21_23() -> None:
    # Phase 21: rebuild generated assets and leave workflow restoration to the
    # connector after the one-shot runner push (GitHub Actions tokens cannot
    # update workflow files without workflows permission).
    subprocess.run(["npm", "run", "frontend:build"], cwd=ROOT, check=True)
    subprocess.run(["npm", "run", "build:css"], cwd=ROOT, check=True)
    batch.commit(
        "Phase 21: rebuild release-candidate generated assets",
        ["static/modern/tvtracker-modern.js", "static/css/tailwind.css"],
    )

    batch.write(
        "tools/release_candidate_torture.py",
        'from pathlib import Path\nimport subprocess,sys\nROOT=Path(__file__).resolve().parents[1]\nsubprocess.run([sys.executable,"tests/run_all.py"],cwd=ROOT,check=True)\nprint("TV Tracker release-candidate torture gate passed.")\n',
    )
    batch.commit(
        "Phase 22: add release-candidate torture entrypoint",
        ["tools/release_candidate_torture.py"],
    )

    batch.write(
        "docs/architecture/PHASE_23_RELEASE_GATE.md",
        "# Phase 23 — Release-candidate PR gate\n\nPR #29 remains unmerged until explicit owner authorization. Final head requires green CI, migration/browser/data/security/Notifications/provider tests, npm audits, generated asset equality, diff hygiene, no historical shims/patches, no Graphik Trial assets, and release documentation. Production rollout is Phase 24 and is not authorized here.\n",
    )
    batch.commit(
        "Phase 23: document final PR release gate",
        ["docs/architecture/PHASE_23_RELEASE_GATE.md"],
    )


batch.phase21_23 = custom_phase21_23
batch.main()

# batch.main removes the original helper and pushes. Remove this wrapper too,
# then push one final helper-cleanup commit. The temporary CI workflow remains
# unchanged until the connector restores it after this run.
this_file = ROOT / "tools/phase14_23_batch_v2.py"
if this_file.exists():
    this_file.unlink()
batch.git("add", "-u", "--", "tools/phase14_23_batch_v2.py")
batch.git("commit", "-m", "cleanup: remove one-shot phase continuation wrapper")
batch.git("push", "origin", "HEAD:architecture-futureproof-2026-08-18")
