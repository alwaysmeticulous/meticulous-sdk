import { resolveApiTokenWithOAuth } from "@alwaysmeticulous/client";
import { getCommitSha, initLogger } from "@alwaysmeticulous/common";
import { uploadAssetChunk } from "@alwaysmeticulous/remote-replay-launcher";
import * as Sentry from "@sentry/node";
import { CommandModule } from "yargs";
import { OPTIONS } from "../../command-utils/common-options";
import { wrapHandler } from "../../command-utils/sentry.utils";
import {
  isOutOfDateClientError,
  OutOfDateCLIError,
} from "../../utils/out-of-date-client-error";
import { resolveProjectIdentifier } from "../../utils/resolve-project-identifier";

interface Options {
  apiToken?: string | undefined;
  chunkName: string;
  chunkVersionId: string;
  chunkAssetsDirectory: string;
  chunkAssetsDirectoryPrefix?: string | undefined;
  commitSha?: string | undefined;
  force?: boolean;
}

const handler = async ({
  apiToken,
  chunkName,
  chunkVersionId,
  chunkAssetsDirectory,
  chunkAssetsDirectoryPrefix,
  commitSha: commitSha_,
  force,
}: Options): Promise<void> => {
  const logger = initLogger();

  const commitSha = await getCommitSha(commitSha_);
  if (!commitSha) {
    logger.error(
      "No commit SHA found. Provide one with --commitSha or run inside a git checkout.",
    );
    process.exit(1);
  }

  Sentry.captureMessage("Received upload asset chunk request", {
    level: "debug",
    extra: { chunkName, chunkVersionId, commitSha },
  });

  const apiToken_ = await resolveApiTokenWithOAuth({
    apiToken,
    enableOAuthLogin: true,
  });

  const projectIdentifier = resolveProjectIdentifier(apiToken_);

  try {
    await uploadAssetChunk({
      apiToken: apiToken_,
      chunkName,
      chunkVersionId,
      chunkAssetsDirectory,
      ...(chunkAssetsDirectoryPrefix ? { chunkAssetsDirectoryPrefix } : {}),
      commitSha,
      ...(force ? { force: true } : {}),
      ...projectIdentifier,
    });
  } catch (error) {
    if (isOutOfDateClientError(error)) {
      throw new OutOfDateCLIError();
    }
    throw error;
  }
};

export const ciUploadAssetChunkCommand: CommandModule<unknown, Options> = {
  command: "upload-asset-chunk",
  describe:
    "Upload a named, versioned chunk of static assets to Meticulous for incremental deployments",
  builder: {
    apiToken: OPTIONS.apiToken,
    chunkName: {
      string: true,
      demandOption: true,
      description: "Logical name of the asset chunk (e.g. 'app', 'vendor').",
    },
    chunkVersionId: {
      string: true,
      demandOption: true,
      description:
        "Version identifier for this chunk (e.g. content hash or build id). Chunks are deduped by (chunkName, chunkVersionId).",
    },
    chunkAssetsDirectory: {
      string: true,
      demandOption: true,
      description:
        "Directory whose contents should be packaged into this chunk.",
    },
    chunkAssetsDirectoryPrefix: {
      string: true,
      description:
        "Optional path prefix prepended to every entry in the chunk (e.g. 'static/assets'). Files in chunkAssetsDirectory will be served under this prefix at replay time.",
    },
    commitSha: OPTIONS.commitSha,
    force: {
      boolean: true,
      default: false,
      description:
        "Re-upload even if a chunk with the same name and versionId is already uploaded. Use for recovery; the server will overwrite the existing chunk.",
    },
  },
  handler: wrapHandler(handler),
};
