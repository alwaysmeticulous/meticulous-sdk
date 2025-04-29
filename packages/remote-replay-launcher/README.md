# Remote Replay Launcher

Exposes a simple API for launching remote (running in Meticulous' cloud) test runs
against an app hosted locally, and exposed via the Meticulous secure tunnels service.
([see @alwaysmeticulous/tunnel-client](../tunnel-client))

Also exposes an API for launching a remote run by uploading static build artifacts
to Meticulous and executing tests against them.
