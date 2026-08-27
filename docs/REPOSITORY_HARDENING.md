# Repository hardening

The application and deployment workflow enforce release safety in code, but the GitHub repository should also protect `main` at the repository-settings layer.

## Required `main` ruleset / branch protection

Configure GitHub so `main`:

1. requires changes to arrive through a pull request;
2. requires the `TV Tracker CI / test` status check to pass before merge;
3. blocks force pushes and branch deletion;
4. requires conversations to be resolved before merge when review threads exist;
5. applies the rule to administrators as well unless an emergency bypass policy is intentionally documented.

The linked automation used to prepare this hardening branch can read protection state but cannot write repository branch-protection or ruleset settings, so this setting must be enabled in GitHub repository settings.

## Defense in depth

Production deployment does not rely on branch protection alone. `.github/workflows/deploy.yml` also:

- tests the exact release SHA;
- requires GitHub to report that SHA as associated with a merged pull request targeting `main`;
- confirms the SHA is still the current tip of `main` immediately before deployment;
- applies additive migrations from a staged checkout before activation;
- records the previous live SHA;
- verifies `/healthz` reports the activated process SHA;
- restores the previous source SHA and restarts when activation health verification fails.

This means an accidental direct push to an otherwise unprotected `main` is not eligible for production deployment, but branch protection should still be enabled to prevent bypassing review and CI at the repository layer.
