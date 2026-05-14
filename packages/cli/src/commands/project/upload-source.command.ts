import { createWriteStream, statSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
import {
  createClient,
  putFileToSignedUrl,
  requestSourceCodeUploadUrl,
  retryTransientUploadErrors,
  UploadError,
} from "@alwaysmeticulous/client";
import { initLogger } from "@alwaysmeticulous/common";
import { create as tarCreate } from "tar";
import { CommandModule } from "yargs";
import { wrapHandler } from "../../command-utils/sentry.utils";

interface Options {
  apiToken?: string | null | undefined;
  commitSha: string;
  sourceDir: string;
}

/**
 * Packages `--sourceDir` as a `source.tar.gz` archive and uploads it to
 * Meticulous so it can be used in place of `git clone` for projects that
 * have source-code uploads enabled.
 *
 * The contents of the archive are exactly the contents of `--sourceDir` —
 * we do not parse `.gitignore` or apply any filtering, so it is the
 * caller's responsibility to point at a directory that contains only what
 * Meticulous needs (i.e. exclude `.git/`, `node_modules/`, `dist/`, build
 * artefacts, secrets, etc.). The recommended pattern is to invoke this
 * after a fresh `git checkout` into a clean directory, or after a
 * `git archive`/`rsync --exclude` step in CI.
 *
 * Usage (typically from the customer's CI on every commit):
 *
 *   meticulous project upload-source \
 *     --commitSha "$(git rev-parse HEAD)" \
 *     --sourceDir ./checkout
 *
 * Requires a project API token (env `METICULOUS_API_TOKEN` or
 * `--apiToken`). Calls from projects that don't have source-code uploads
 * enabled are rejected with a 403.
 */
export const uploadSourceCommand: CommandModule<unknown, Options> = {
  command: "upload-source",
  describe: "Upload a source-code archive for a given commit to Meticulous",
  builder: {
    apiToken: {
      string: true,
      description:
        "Meticulous project API token. Defaults to METICULOUS_API_TOKEN.",
    },
    commitSha: {
      string: true,
      demandOption: true,
      description: "Commit SHA the uploaded archive corresponds to",
    },
    sourceDir: {
      string: true,
      demandOption: true,
      description:
        "Directory to package into source.tar.gz. The directory's contents " +
        "are uploaded verbatim — exclude `.git`, `node_modules`, build " +
        "artefacts and any other paths you don't want sent to Meticulous " +
        "before invoking this command.",
    },
  },
  handler: wrapHandler(async ({ apiToken, commitSha, sourceDir }) => {
    const logger = initLogger();
    const client = createClient({ apiToken });

    const tmpDir = await mkdtemp(join(tmpdir(), "meticulous-source-"));
    const archivePath = join(tmpDir, "source.tar.gz");
    try {
      logger.info(`Packaging ${sourceDir} into ${archivePath}...`);
      // We package `sourceDir` verbatim: no `.gitignore` parsing, no
      // filtering. The caller is responsible for pointing at a directory
      // that contains only what Meticulous needs — see the JSDoc above.
      // `portable` produces reproducible archives across platforms; `gzip`
      // gives us the `.gz` wire format the cloud worker decompresses with
      // `streamDownloadAndExtractTarGz`.
      await pipeline(
        tarCreate(
          {
            cwd: sourceDir,
            gzip: true,
            portable: true,
          },
          ["."],
        ),
        createWriteStream(archivePath),
      );

      const { size } = statSync(archivePath);
      logger.info(
        `Archive ready: ${(size / (1024 * 1024)).toFixed(2)} MiB. Requesting upload URL...`,
      );

      const { uploadUrl } = await requestSourceCodeUploadUrl({
        client,
        commitSha,
        size,
      });

      logger.info(`Uploading source archive for commit ${commitSha}...`);
      await retryTransientUploadErrors(
        () =>
          putFileToSignedUrl({
            filePath: archivePath,
            signedUrl: uploadUrl,
            size,
            contentType: "application/gzip",
          }),
        {
          onRetry: (attempt, error) => {
            const reason =
              error instanceof UploadError
                ? `HTTP ${error.statusCode}`
                : error instanceof Error
                  ? error.message
                  : String(error);
            logger.warn(
              `Transient upload error on attempt ${attempt} (${reason}); will retry...`,
            );
          },
        },
      );

      logger.info(
        `Successfully uploaded source archive for commit ${commitSha}.`,
      );
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }),
};
