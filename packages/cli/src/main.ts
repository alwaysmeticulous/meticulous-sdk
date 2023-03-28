import { setMeticulousLocalDataDir } from "@alwaysmeticulous/common";
import yargs from "yargs";
import { bootstrapCommand } from "./commands/bootstrap/bootstrap.command";
import { createTestCommand } from "./commands/create-test/create-test.command";
import { downloadReplayCommand } from "./commands/download-replay/download-replay.command";
import { downloadSessionCommand } from "./commands/download-session/download-session.command";
import { recordCommand } from "./commands/record/record.command";
import { replayCommand } from "./commands/replay/replay.command";
import { runAllTestsCommand } from "./commands/run-all-tests/run-all-tests.command";
import { serveCommand } from "./commands/serve/serve.command";
import { showProjectCommand } from "./commands/show-project/show-project.command";
import { updateTestsCommand } from "./commands/update-tests/update-tests.command";
import { initLogger, setLogLevel } from "./utils/logger.utils";
import { initSentry, setOptions } from "./utils/sentry.utils";

const handleDataDir: (dataDir: string | null | undefined) => void = (
  dataDir
) => {
  setMeticulousLocalDataDir(dataDir);
};

export const main: () => void = async () => {
  initLogger();
  await initSentry();

  yargs
    .scriptName("meticulous")
    .usage(
      `$0 <command>

      Meticulous CLI`
    )
    .command(bootstrapCommand)
    .command(createTestCommand)
    .command(downloadReplayCommand)
    .command(downloadSessionCommand)
    .command(recordCommand)
    .command(replayCommand)
    .command(runAllTestsCommand)
    .command(showProjectCommand)
    .command(updateTestsCommand)
    .command("serve", false, serveCommand) // This is a debugging command, so we hide it to not pollute the main menu
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
