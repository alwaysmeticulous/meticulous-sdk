import { CommandModule } from "yargs";
import { ciPrepareCommand } from "./prepare.command";
import { ciRunLocalCommand } from "./run-local.command";
import { ciRunCommand } from "./run.command";
import { ciStartTunnelCommand } from "./start-tunnel.command";
import { ciUploadAssetsCommand } from "./upload-assets.command";
import { ciUploadContainerCommand } from "./upload-container.command";

export const ciCommand: CommandModule = {
  command: "ci",
  describe: "CI/CD commands",
  builder: (yargs) =>
    yargs
      .command(ciRunCommand)
      .command(ciRunLocalCommand)
      .command(ciPrepareCommand)
      .command(ciStartTunnelCommand)
      .command(ciUploadAssetsCommand)
      .command(ciUploadContainerCommand)
      .demandCommand()
      .help(),
  handler: () => {
    // subcommand handles this
  },
};
