import { setMeticulousLocalDataDir } from "@alwaysmeticulous/common";
import yargs from "yargs";
import { bootstrap } from "./commands/bootstrap/bootstrap.command";
import { createTest } from "./commands/create-test/create-test.command";
import { debugReplay } from "./commands/debug-replay/debug-replay.command";
import { downloadReplay } from "./commands/download-replay/download-replay.command";
import { downloadSession } from "./commands/download-session/download-session.command";
import { record } from "./commands/record/record.command";
import { replay } from "./commands/replay/replay.command";
import { runAllTests } from "./commands/run-all-tests/run-all-tests.command";
import { screenshotDiff } from "./commands/screenshot-diff/screenshot-diff.command";
import { serve } from "./commands/serve/serve.command";
import { showProject } from "./commands/show-project/show-project.command";
import { updateTests } from "./commands/update-tests/update-tests.command";
import { initLogger, setLogLevel } from "./utils/logger.utils";
import { initSentry, setOptions } from "./utils/sentry.utils";

const handleDataDir: (dataDir: string | null | undefined) => void = (
  dataDir
) => {
  setMeticulousLocalDataDir(dataDir);
};

export const main: () => void = () => {
  initLogger();
  initSentry();

  const promise = yargs
    .scriptName("meticulous")
    .usage(
      `$0 <command>

      Meticulous CLI`
    )
    .command(bootstrap)
    .command(createTest)
    .command(debugReplay)
    .command(downloadReplay)
    .command(downloadSession)
    .command(record)
    .command(replay)
    .command(runAllTests)
    .command(screenshotDiff)
    .command(showProject)
    .command(updateTests)
    .command("serve", false, serve) // This is a debugging command, so we hide it to not pollute the main menu
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

  if (promise instanceof Promise) {
    promise.catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }
};

main();
