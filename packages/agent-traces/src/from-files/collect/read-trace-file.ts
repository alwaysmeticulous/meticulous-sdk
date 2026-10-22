import { readFile } from "fs/promises";
import type { AgentTraceRawFile } from "../../types/raw-envelope.types";
import type { TraceFile } from "../trace-files.types";

export const readTraceFile = async (
  file: TraceFile,
  relativePath: string,
): Promise<AgentTraceRawFile> => {
  const buffer = await readFile(file.path);
  return {
    relativePath,
    mtimeMs: file.mtimeMs,
    sizeBytes: buffer.length,
    content: buffer.toString("utf8"),
  };
};
