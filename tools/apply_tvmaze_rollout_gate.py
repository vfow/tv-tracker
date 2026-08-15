from apply_tvmaze_rollout import replace

# Phase 0 repairs two stale source-contract assertions exposed by running every test.
replace(
    "tests/test_source_contracts.py",
    "self.assertIn('test_sync_reliability.js', run_all)",
    "self.assertIn('.glob(\"test_*.js\")', run_all)",
)
replace(
    "tests/test_source_contracts.py",
    "self.assertIn('ALLOWED_STATE_KEYS = {\"profile\", \"movies\",', backend)",
    "self.assertIn('ALLOWED_STATE_KEYS = {', backend)\n        self.assertIn('\"movies\",', backend)",
)

print("Full-suite contract repairs applied.")
