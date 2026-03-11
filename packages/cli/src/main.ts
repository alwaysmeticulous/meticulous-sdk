import { join, normalize } from "path";
import {
  getMeticulousVersion,
  initLogger,
  setLogLevel,
  setMeticulousLocalDataDir,
} from "@alwaysmeticulous/common";
import { initSentry } from "@alwaysmeticulous/sentry";
import yargs from "yargs";
import { setOptions } from "./command-utils/sentry.utils";
import { authCommand } from "./commands/auth/index";
import { ciCommand } from "./commands/ci/index";
import { deprecatedAliases } from "./commands/deprecated-aliases";
import { downloadCommand } from "./commands/download/index";
import { projectCommand } from "./commands/project/index";
import { recordCommand } from "./commands/record/index";
import { replayCommand } from "./commands/replay.command";

const handleDataDir = (dataDir: string | null | undefined): void => {
  setMeticulousLocalDataDir(dataDir);
};

export const main = async (): Promise<void> => {
  initLogger();
  const packageJsonPath = normalize(join(__dirname, "../package.json"));
  const meticulousVersion = await getMeticulousVersion(packageJsonPath);
  await initSentry(meticulousVersion);

  const cli = yargs
    .scriptName("meticulous")
    .usage(
      `$0 <command>

      Meticulous CLI`,
    )
    .command(authCommand)
    .command(ciCommand)
    .command(downloadCommand)
    .command(projectCommand)
    .command(recordCommand)
    .command(replayCommand);

  for (const alias of deprecatedAliases) {
    cli.command(alias);
  }

  await cli
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
      rawJson: {
        string: true,
        description:
          "Pass all options as a JSON string (for agent/programmatic use)",
      },
    })
    .middleware(
      [
        (argv) => {
          if (argv.rawJson) {
            Object.assign(argv, JSON.parse(argv.rawJson as string));
          }
        },
      ],
      true,
    )
    .middleware([
      (argv) => setLogLevel(argv.logLevel),
      (argv) => handleDataDir(argv.dataDir),
      (argv) => setOptions(argv),
    ]).argv;
};

void main();
