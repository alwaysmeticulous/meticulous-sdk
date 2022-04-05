import yargs from "yargs";
import { downloadReplay } from "./commands/download-replay/download-replay.command";
import { downloadSession } from "./commands/download-session/download-session.command";
import { record } from "./commands/record/record.command";
import { replay } from "./commands/replay/replay.command";
import { screenshotDiff } from "./commands/screenshot-diff/screenshot-diff.command";
import { showProject } from "./commands/show-project/show-project.command";
import { uploadBuild } from "./commands/upload-build/upload-build.command";
import { getMeticulousLocalDataDir } from "./local-data/local-data";

const handleDataDir: (dataDir: string | null | undefined) => void = (
  dataDir
) => {
  getMeticulousLocalDataDir(dataDir);
};

export const main: () => void = () => {
  const promise = yargs
    .scriptName("meticulous")
    .usage(
      `$0 <command>

      Meticulous CLI`
    )
    .command(downloadReplay)
    .command(downloadSession)
    .command(record)
    .command(replay)
    .command(screenshotDiff)
    .command(showProject)
    .command(uploadBuild)
    .help()
    .strictCommands()
    .demandCommand()
    .option({
      dataDir: {
        string: true,
        description: "Where Meticulous stores data (sessions, replays, etc.)",
      },
    })
    .middleware([(argv) => handleDataDir(argv.dataDir)]).argv;

  if (promise instanceof Promise) {
    promise.catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }
};

main();
