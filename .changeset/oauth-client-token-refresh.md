---
"@alwaysmeticulous/client": patch
---

fix(client): refresh OAuth access tokens per request

`createClientWithOAuth` previously resolved the OAuth access token once and baked it into the client for its whole lifetime. OAuth access tokens are short-lived, so long-running commands (e.g. polling a test run to completion via `--waitForTestRunToComplete`, or the custom-checks wait-for-test-run loop) would start failing once the token expired — surfacing as HTTP 401, or HTTP 404 on endpoints whose permission check is masked as not-found. The client now re-resolves the token per request (auto-refreshing via the stored refresh token) when authenticating via OAuth; static API tokens are unchanged.
