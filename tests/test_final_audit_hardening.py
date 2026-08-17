from __future__ import annotations

import json
import unittest
from pathlib import Path

import final_notifications as final


ROOT = Path(__file__).resolve().parents[1]


class FinalAuditHardeningTests(unittest.TestCase):
    def read(self, relative: str) -> str:
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_ci_runs_once_for_pull_requests_and_gates_runtime_npm_dependencies(self):
        workflow = self.read(".github/workflows/ci.yml")
        package = json.loads(self.read("package.json"))

        self.assertIn("pull_request:", workflow)
        self.assertIn("workflow_dispatch:", workflow)
        self.assertNotIn("branches-ignore:", workflow)
        self.assertIn("npm ci --audit=false", workflow)
        self.assertIn("npm audit --omit=dev --audit-level=high", workflow)
        self.assertFalse(package.get("dependencies"), "Runtime npm dependencies must remain explicitly audited")

    def test_deploy_restarts_alwaysdata_with_supported_python_before_health_check(self):
        workflow = self.read(".github/workflows/deploy.yml")

        self.assertIn('PYTHON_BIN="python"', workflow)
        self.assertNotIn('PYTHON_BIN="python3"', workflow)
        self.assertIn("ALWAYSDATA_API_KEY", workflow)
        self.assertIn("ALWAYSDATA_ACCOUNT", workflow)
        self.assertIn("ALWAYSDATA_SITE_ID", workflow)
        self.assertIn("https://api.alwaysdata.com/v1/site/${ALWAYSDATA_SITE_ID}/restart/", workflow)
        self.assertIn("npm audit --omit=dev --audit-level=high", workflow)
        self.assertIn("--retry 12 --retry-delay 5 --retry-all-errors", workflow)
        self.assertLess(workflow.index("Restart AlwaysData site"), workflow.index("Verify public health endpoint"))

    def test_service_worker_keeps_valid_push_clicks_until_acknowledged(self):
        source = final._service_worker_source()

        self.assertIn("async function readPendingClicks()", source)
        self.assertIn("async function acknowledgePendingClicks(ids)", source)
        self.assertIn('event.data.type === "tvtracker-ack-push-clicks"', source)
        self.assertIn("store.delete(id)", source)
        self.assertNotIn("store.clear()", source)

    def test_frontend_acks_only_successfully_consumed_push_clicks(self):
        source = self.read("static/js/notifications-final.js")

        self.assertIn("async function acknowledgePushClicks(ids)", source)
        self.assertIn('type:"tvtracker-ack-push-clicks"', source)
        self.assertIn("const marked = await markPushClickRead(id);", source)
        self.assertIn("return marked ? id : 0;", source)
        self.assertIn("return true;", source)
        self.assertIn("return false;", source)
        self.assertIn("error && error.status === 404", source)


if __name__ == "__main__":
    unittest.main()
