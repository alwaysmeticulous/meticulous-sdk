import type { CommandModule } from "yargs";
import { ciAgentTestCommand } from "./agent-test.command";
import { ciLabelCommitCommand } from "./label-commit.command";
import { ciPrepareCommand } from "./prepare.command";
import {
  ciRemovedRunWithTunnelCommand,
  ciRemovedStartTunnelCommand,
} from "./removed-tunnel-commands";
import { ciRunLocalCommand } from "./run-local.command";
import { ciRunWithUploadedAssetChunksCommand } from "./run-with-uploaded-asset-chunks.command";
import { ciUploadAssetChunkCommand } from "./upload-asset-chunk.command";
import { ciUploadAssetsCommand } from "./upload-assets.command";
import { ciUploadContainerCommand } from "./upload-container.command";

export const ciCommand: CommandModule = {
  command: "ci",
  describe: "CI/CD commands",
  builder: (yargs) =>
    yargs
      .command(ciRunLocalCommand)
      .command(ciPrepareCommand)
      .command(ciUploadAssetsCommand)
      .command(ciUploadAssetChunkCommand)
      .command(ciRunWithUploadedAssetChunksCommand)
      .command(ciUploadContainerCommand)
      .command(ciAgentTestCommand)
      .command(ciLabelCommitCommand)
      .command(ciRemovedRunWithTunnelCommand)
      .command(ciRemovedStartTunnelCommand)
      .demandCommand()
      .help(),
  handler: () => {
    // subcommand handles this
  },
};
