import type { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";
import { CliUserError } from "../../utils/cli-user-error";

const TUNNEL_REMOVED_MESSAGE =
  "Secure tunnels are no longer supported, so this command has been removed. " +
  "Use `meticulous ci upload-assets` for a static build, or `meticulous ci upload-container` for an app that needs a server: " +
  "https://app.meticulous.ai/docs/github-actions-v2";

// Hidden stubs so CI pipelines still invoking a removed tunnel command get
// migration guidance instead of yargs' bare "Unknown argument". They accept
// any of the old options (strict mode off) and always fail.
const createRemovedTunnelCommand = (command: string): CommandModule => ({
  command,
  describe: false,
  builder: (yargs) => yargs.strict(false),
  handler: wrapHandler(() =>
    Promise.reject(new CliUserError(TUNNEL_REMOVED_MESSAGE)),
  ),
});

export const ciRemovedRunWithTunnelCommand =
  createRemovedTunnelCommand("run-with-tunnel");
export const ciRemovedStartTunnelCommand =
  createRemovedTunnelCommand("start-tunnel");
export const removedRunAllTestsInCloudCommand = createRemovedTunnelCommand(
  "run-all-tests-in-cloud",
);
