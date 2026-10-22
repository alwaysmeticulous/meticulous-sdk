import { open } from "fs/promises";

const CHUNK_BYTES = 64 * 1024;

/**
 * Reads up to `maxLines` complete lines from the start of a file, stopping
 * after `maxBytes`. A line cut off by the byte limit is dropped.
 */
export const readHeadLines = async (
  path: string,
  maxLines: number,
  maxBytes: number,
): Promise<string[]> => {
  const handle = await open(path, "r");
  try {
    const chunks: Buffer[] = [];
    let total = 0;
    let newlines = 0;
    let reachedEnd = false;
    while (total < maxBytes && newlines < maxLines) {
      const chunk = Buffer.alloc(Math.min(CHUNK_BYTES, maxBytes - total));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, total);
      if (bytesRead === 0) {
        reachedEnd = true;
        break;
      }
      const data = chunk.subarray(0, bytesRead);
      chunks.push(data);
      total += bytesRead;
      newlines += data.filter((byte) => byte === 10).length;
    }
    const lines = Buffer.concat(chunks).toString("utf8").split("\n");
    if (!reachedEnd) {
      lines.pop();
    }
    return lines.slice(0, maxLines);
  } finally {
    await handle.close();
  }
};
