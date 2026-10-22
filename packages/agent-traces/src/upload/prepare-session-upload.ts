import { promisify } from "util";
import { gzip as gzipCallback } from "zlib";
import type { SessionStats } from "../atif/session-stats.types";
import { redactSecrets } from "../redact/redact-secrets";
import { excludeToolOutputs } from "../tool-output-exclusion/exclude-tool-outputs";
import { computeContentSha256 } from "./compute-content-sha256";
import type { SessionPayload } from "./session-payload.types";

const gzip = promisify(gzipCallback);

export interface PreparedSessionUpload {
  atifJson: string;
  atifGzipped: Buffer;
  rawGzipped: Buffer;
  contentSha256: string;
  stats: SessionStats;
}

/**
 * Produces both upload payloads from a converted session, without the
 * outputs of excluded tools, and with anything that looks like a credential
 * redacted from each.
 */
export const prepareSessionUpload = async (
  converted: SessionPayload,
  excludeToolOutputRegexes: RegExp[],
): Promise<PreparedSessionUpload> => {
  const payload = excludeToolOutputs(converted, excludeToolOutputRegexes);
  const files = payload.envelope.files.map((file) => {
    const content = redactSecrets(file.content);
    return { ...file, content, sizeBytes: Buffer.byteLength(content) };
  });
  const atifJson = redactSecrets(JSON.stringify(payload.trajectory));
  const { stats } = payload;
  return {
    atifJson,
    atifGzipped: await gzip(atifJson),
    rawGzipped: await gzip(JSON.stringify({ ...payload.envelope, files })),
    contentSha256: computeContentSha256(files),
    stats: { ...stats, title: stats.title && redactSecrets(stats.title) },
  };
};
