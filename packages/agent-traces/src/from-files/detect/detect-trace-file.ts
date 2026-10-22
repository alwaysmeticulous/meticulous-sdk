import { readFile } from "fs/promises";
import { extname } from "path";
import { readHeadLines } from "../collect/read-head-lines";
import type {
  DetectedTraceFile,
  FileTraceAgent,
  TraceFile,
} from "../trace-files.types";
import { detectJsonFile } from "./detect-json-file";
import { detectJsonlFile } from "./detect-jsonl-file";
import { isCursorTextTranscript } from "./sniff-trace-content";

/** Enough to get past the queue and snapshot lines some transcripts start with. */
const HEAD_LINES = 20;
const HEAD_BYTES = 4 * 1024 * 1024;
const TEXT_HEAD_BYTES = 64 * 1024;

/**
 * Works out a file's format from its contents, reading only the first lines
 * of JSONL and text files. With `agentOverride`, every file with a matching
 * extension is taken to be in that agent's format. Null when unrecognised.
 */
export const detectTraceFile = async (
  file: TraceFile,
  agentOverride: FileTraceAgent | null,
): Promise<DetectedTraceFile | null> => {
  switch (extname(file.path)) {
    case ".jsonl":
      return detectJsonlFile(
        file,
        await readHeadLines(file.path, HEAD_LINES, HEAD_BYTES),
        agentOverride,
      );
    case ".json":
      return detectJsonFile(
        file,
        parseJson(await readFile(file.path, "utf8")),
        agentOverride,
      );
    case ".txt": {
      if (agentOverride && agentOverride !== "cursor") {
        return null;
      }
      const head = await readHeadLines(file.path, Infinity, TEXT_HEAD_BYTES);
      return agentOverride || isCursorTextTranscript(head.join("\n"))
        ? { ...file, format: "cursor" }
        : null;
    }
    default:
      return null;
  }
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
