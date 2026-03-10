import { CommandModule } from "yargs";
import { ciPrepareCommand } from "./ci/prepare.command";
import { ciRunCommand } from "./ci/run.command";
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
    const separator = "=".repeat(72);
    process.stderr.write(
      `\n${separator}\nDEPRECATION WARNING\n'${oldName}' has been renamed. Use 'meticulous ${newName}' instead.\nThis old name will be removed in a future version.\n${separator}\n\n`,
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
    "prepare-for-meticulous-tests",
    "ci prepare",
    ciPrepareCommand,
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
