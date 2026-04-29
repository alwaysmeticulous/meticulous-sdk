import { createReadStream, createWriteStream, statSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
import {
  createClient,
  requestSourceCodeUploadUrl,
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
 * Usage (typically from the customer's CI on every commit):
 *
 *   meticulous project upload-source \
 *     --commitSha "$(git rev-parse HEAD)" \
 *     --sourceDir .
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
      default: ".",
      description: "Directory to package into source.tar.gz (default: cwd)",
    },
  },
  handler: wrapHandler(async ({ apiToken, commitSha, sourceDir }) => {
    const logger = initLogger();
    const client = createClient({ apiToken });

    const tmpDir = await mkdtemp(join(tmpdir(), "meticulous-source-"));
    const archivePath = join(tmpDir, "source.tar.gz");
    try {
      logger.info(`Packaging ${sourceDir} into ${archivePath}...`);
      // `tar` honours `.gitignore` style ignore via filter; we use `portable`
      // for reproducible archives across platforms and `gzip: true` for the
      // .gz extension. We follow symlinks (`follow: true`) so a symlinked
      // monorepo workspace gets included as expected. Customers that want to
      // exclude paths can pre-prune `sourceDir` (e.g. `--sourceDir packages/foo`).
      await pipeline(
        tarCreate(
          {
            cwd: sourceDir,
            gzip: true,
            follow: true,
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
      const response = await fetch(uploadUrl, {
        method: "PUT",
        // `fetch` accepts a Node ReadableStream as a body in Node 18.17+.
        // We must set duplex: "half" to satisfy the spec for streaming bodies.
        body: createReadStream(archivePath) as unknown as BodyInit,
        headers: {
          "Content-Type": "application/gzip",
          "Content-Length": String(size),
        },
        // @ts-expect-error -- `duplex` is part of the WHATWG fetch spec but
        // not yet in lib.dom.d.ts. Required when streaming a request body.
        duplex: "half",
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Source archive upload failed: ${response.status} ${response.statusText} ${text}`,
        );
      }

      logger.info(
        `Successfully uploaded source archive for commit ${commitSha}.`,
      );
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }),
};
