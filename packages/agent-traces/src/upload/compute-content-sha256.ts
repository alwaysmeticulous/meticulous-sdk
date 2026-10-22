import type { AgentTraceRawFile } from "../types/raw-envelope.types";
import { createHash } from "crypto";

/**
 * Hashes paths and contents but not mtimes, so touching a file without
 * changing it doesn't defeat the server's `already-uploaded` check. Each field
 * is length-prefixed so different file sets can't hash the same.
 */
export const computeContentSha256 = (files: AgentTraceRawFile[]): string => {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`${Buffer.byteLength(file.relativePath)}:${file.relativePath}`);
    hash.update(`${file.sizeBytes}:`);
    hash.update(file.content);
  }
  return hash.digest("hex");
};
