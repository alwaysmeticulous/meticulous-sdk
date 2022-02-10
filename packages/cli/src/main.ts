import yargs from "yargs";
import { showProject } from "./commands/show-project/show-project.command";
import { uploadBuild } from "./commands/upload-build/upload-build.command";

export const main: () => void = () => {
  const promise = yargs
    .scriptName("meticulous")
    .usage(
      `$0 <command>

      Meticulous CLI`
    )
    .command(showProject)
    .command(uploadBuild)
    .help()
    .strictCommands()
    .demandCommand().argv;

  if (promise instanceof Promise) {
    promise.catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }
};

main();
