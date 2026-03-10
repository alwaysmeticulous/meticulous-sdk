import { initLogger } from "@alwaysmeticulous/common";
import { CommandModule } from "yargs";
import { ciPrepareCommand } from "./ci/prepare.command";
import { ciRunLocalCommand } from "./ci/run-local.command";
import { ciRunCommand } from "./ci/run.command";
import { ciStartTunnelCommand } from "./ci/start-tunnel.command";
import { ciUploadAssetsCommand } from "./ci/upload-assets.command";
import { ciUploadContainerCommand } from "./ci/upload-container.command";

const createDeprecatedAlias = (
  oldName: string,
  newName: string,
  target: CommandModule<any, any>,
): CommandModule => ({
  command: oldName,
  describe: false, // hidden from help
  builder: target.builder ?? {},
  handler: (args) => {
    initLogger().warn(
      `Warning: '${oldName}' is deprecated and will be removed in a future version. Use 'meticulous ${newName}' instead.`,
    );
    return (target.handler as (args: unknown) => void | Promise<void>)(args);
  },
});

export const deprecatedAliases: CommandModule[] = [
  createDeprecatedAlias(
    "run-all-tests-in-cloud",
    "ci run-with-tunnel",
    ciRunCommand,
  ),
  createDeprecatedAlias(
    "run-all-tests",
    "ci run-local",
    ciRunLocalCommand,
  ),
  createDeprecatedAlias(
    "prepare-for-meticulous-tests",
    "ci prepare",
    ciPrepareCommand,
  ),
  createDeprecatedAlias(
    "start-local-tunnel",
    "ci start-tunnel",
    ciStartTunnelCommand,
  ),
  createDeprecatedAlias(
    "upload-assets-and-execute-test-run-in-cloud",
    "ci upload-assets",
    ciUploadAssetsCommand,
  ),
  createDeprecatedAlias(
    "upload-container-and-execute-test-run-in-cloud",
    "ci upload-container",
    ciUploadContainerCommand,
  ),
];
