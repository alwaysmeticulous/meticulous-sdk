# Remote Replay Launcher

Exposes a simple API for launching remote (running in Meticulous' cloud) test runs
against an app hosted locally, and exposed via the Meticulous secure tunnels service.
([see @alwaysmeticulous/tunnel-client](../tunnel-client))

Also exposes APIs for launching remote test runs by:
- Uploading static build artifacts (assets) to Meticulous
- Uploading Docker containers to Meticulous' container registry
