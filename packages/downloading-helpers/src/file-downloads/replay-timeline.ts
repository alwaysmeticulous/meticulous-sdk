import { createReadStream, existsSync, readFileSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";

/**
 * A replay's timeline is uploaded as `timeline.ndjson` (one entry per line).
 * Replays produced before that artifact existed instead have `timeline.json`
 * (a single JSON array), which is no longer written. Every reader should go
 * through these helpers so it keeps working whichever one a replay directory
 * holds.
 */
export const TIMELINE_NDJSON_FILE_NAME = "timeline.ndjson";
export const TIMELINE_JSON_FILE_NAME = "timeline.json";

export type ReplayTimelineFormat = "ndjson" | "json";

export interface ReplayTimelineFile {
  path: string;
  format: ReplayTimelineFormat;
}

/**
 * The timeline file present in `replayDir`, preferring the ndjson form, or
 * `null` when the directory holds neither.
 */
export const resolveReplayTimelineFile = (
  replayDir: string,
): ReplayTimelineFile | null => {
  const ndjsonPath = join(replayDir, TIMELINE_NDJSON_FILE_NAME);
  if (existsSync(ndjsonPath)) {
    return { path: ndjsonPath, format: "ndjson" };
  }
  const jsonPath = join(replayDir, TIMELINE_JSON_FILE_NAME);
  if (existsSync(jsonPath)) {
    return { path: jsonPath, format: "json" };
  }
  return null;
};

export const timelineFormatForFileName = (
  fileName: string,
): ReplayTimelineFormat => (fileName.endsWith(".ndjson") ? "ndjson" : "json");

/**
 * Reads the whole timeline in `replayDir` into memory. Throws when the
 * directory holds no timeline file at all, like `readFile` would.
 */
export const readReplayTimelineFromDir = async <T = unknown>(
  replayDir: string,
): Promise<T[]> => {
  const file = resolveReplayTimelineFile(replayDir);
  if (file == null) {
    throw new Error(
      `No ${TIMELINE_NDJSON_FILE_NAME} or ${TIMELINE_JSON_FILE_NAME} in ${replayDir}`,
    );
  }
  return readReplayTimelineFile<T>(file);
};

export const readReplayTimelineFile = async <T = unknown>(
  file: ReplayTimelineFile,
): Promise<T[]> => {
  if (file.format === "ndjson") {
    const entries: T[] = [];
    await forEachTimelineEntryInNdjsonFile<T>(file.path, (entry) =>
      entries.push(entry),
    );
    return entries;
  }
  return JSON.parse(await readFile(file.path, { encoding: "utf-8" })) as T[];
};

export const readReplayTimelineFileSync = <T = unknown>(
  file: ReplayTimelineFile,
): T[] => {
  const text = readFileSync(file.path, "utf-8");
  if (file.format === "ndjson") {
    return parseTimelineNdjson<T>(text);
  }
  return JSON.parse(text) as T[];
};

export const parseTimelineNdjson = <T = unknown>(text: string): T[] => {
  const entries: T[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0) {
      continue;
    }
    entries.push(JSON.parse(line) as T);
  }
  return entries;
};

/**
 * Streams an ndjson timeline file, invoking `onEntry` once per line and
 * never holding more than a single entry on the heap. `onEntry` must not
 * retain the entry beyond what it means to keep: the point of streaming is
 * that everything not held becomes garbage immediately.
 *
 * Splits on `\n` only. `readline` is deliberately not used: it also breaks
 * lines at U+2028 / U+2029, which `JSON.stringify` leaves unescaped inside
 * strings, so it would cut any entry containing one in half.
 */
export const forEachTimelineEntryInNdjsonFile = async <T = unknown>(
  filePath: string,
  onEntry: (entry: T) => void,
): Promise<void> => {
  const stream = createReadStream(filePath, { encoding: "utf-8" });
  const emitLine = (line: string) => {
    const withoutCr = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (withoutCr.length > 0) {
      onEntry(JSON.parse(withoutCr) as T);
    }
  };
  try {
    let partialLine = "";
    for await (const chunk of stream as AsyncIterable<string>) {
      let lineStart = 0;
      let newlineIndex = chunk.indexOf("\n");
      while (newlineIndex !== -1) {
        emitLine(partialLine + chunk.slice(lineStart, newlineIndex));
        partialLine = "";
        lineStart = newlineIndex + 1;
        newlineIndex = chunk.indexOf("\n", lineStart);
      }
      partialLine += chunk.slice(lineStart);
    }
    emitLine(partialLine);
  } finally {
    // A throw from JSON.parse (or from `onEntry`) exits the for-await early;
    // destroy the stream explicitly so a malformed line can't leak the fd.
    stream.destroy();
  }
};
