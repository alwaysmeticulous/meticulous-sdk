import { join, normalize } from "path";
import {
  getMeticulousVersion,
  initLogger,
  setLogLevel,
  setMeticulousLocalDataDir,
} from "@alwaysmeticulous/common";
import { initSentry } from "@alwaysmeticulous/sentry";
import yargs from "yargs";
import { downloadReplayCommand } from "./commands/download-replay/download-replay.command";
import { downloadSessionCommand } from "./commands/download-session/download-session.command";
import { downloadTestRunCommand } from "./commands/download-test-run/download-test-run.command";
import { recordCommand } from "./commands/record/record.command";
import { recordLoginCommand } from "./commands/record-login/record-login.command";
import { replayCommand } from "./commands/replay/replay.command";
import { runAllTestsCommand } from "./commands/run-all-tests/run-all-tests.command";
import { runAllTestsInCloudCommand } from "./commands/run-all-tests-in-cloud/run-all-tests-in-cloud.command";
import { showProjectCommand } from "./commands/show-project/show-project.command";
import { startLocalTunnelCommand } from "./commands/start-local-tunnel/start-local-tunnel.command";
import { uploadAssetsAndExecuteTestRunInCloudCommand } from "./commands/upload-assets-and-execute-test-run-in-cloud/upload-assets-and-execute-test-run-in-cloud.command";
import { setOptions } from "./utils/sentry.utils";

const handleDataDir: (dataDir: string | null | undefined) => void = (
  dataDir
) => {
  setMeticulousLocalDataDir(dataDir);
};

export const main: () => void = async () => {
  initLogger();
  const packageJsonPath = normalize(join(__dirname, "../package.json"));
  const meticulousVersion = await getMeticulousVersion(packageJsonPath);
  await initSentry(meticulousVersion);

  await yargs
    .scriptName("meticulous")
    .usage(
      `$0 <command>

      Meticulous CLI`
    )
    .command(downloadReplayCommand)
    .command(downloadSessionCommand)
    .command(downloadTestRunCommand)
    .command(recordCommand)
    .command(recordLoginCommand)
    .command(replayCommand)
    .command(runAllTestsCommand)
    .command(runAllTestsInCloudCommand)
    .command(showProjectCommand)
    .command(startLocalTunnelCommand)
    .command(uploadAssetsAndExecuteTestRunInCloudCommand)
    .help()
    .strict()
    .demandCommand()
    .option({
      logLevel: {
        choices: ["trace", "debug", "info", "warn", "error", "silent"],
        description: "Log level",
      },
      dataDir: {
        string: true,
        description: "Where Meticulous stores data (sessions, replays, etc.)",
      },
    })
    .middleware([
      (argv) => setLogLevel(argv.logLevel),
      (argv) => handleDataDir(argv.dataDir),
      (argv) => setOptions(argv),
    ]).argv;
};

main();
