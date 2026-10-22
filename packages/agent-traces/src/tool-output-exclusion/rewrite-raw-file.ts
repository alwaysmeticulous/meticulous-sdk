import type { AgentTraceRawFile } from "../types/raw-envelope.types";

/** Mutates the parsed value and returns whether it changed anything. */
export type JsonRewrite = (value: unknown) => boolean;

/** Lines that don't parse are kept verbatim. */
export const rewriteJsonLinesFile = (
  file: AgentTraceRawFile,
  rewrite: JsonRewrite,
): AgentTraceRawFile => {
  let changed = false;
  const lines = file.content.split("\n").map((line) => {
    const parsed = parseJson(line);
    if (parsed === undefined || !rewrite(parsed)) {
      return line;
    }
    changed = true;
    return JSON.stringify(parsed);
  });
  return changed ? withContent(file, lines.join("\n")) : file;
};

/** A file that doesn't parse is kept verbatim. */
export const rewriteJsonFile = (
  file: AgentTraceRawFile,
  rewrite: JsonRewrite,
  format: (value: unknown) => string = (value) => JSON.stringify(value),
): AgentTraceRawFile => {
  const parsed = parseJson(file.content);
  if (parsed === undefined || !rewrite(parsed)) {
    return file;
  }
  return withContent(file, format(parsed));
};

/** Visits every object nested in `value`, parents before children. */
export const forEachObject = (
  value: unknown,
  visit: (record: Record<string, unknown>) => void,
): void => {
  if (Array.isArray(value)) {
    value.forEach((item) => forEachObject(item, visit));
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  const record = value as Record<string, unknown>;
  visit(record);
  Object.values(record).forEach((child) => forEachObject(child, visit));
};

/** Deletes every key of `record` not in `kept`, then sets `extra`. */
export const keepOnly = (
  record: Record<string, unknown>,
  kept: ReadonlySet<string>,
  extra: Record<string, unknown>,
): void => {
  for (const key of Object.keys(record)) {
    if (!kept.has(key)) {
      delete record[key];
    }
  }
  Object.assign(record, extra);
};

const parseJson = (text: string): unknown => {
  if (text.trim() === "") {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const withContent = (
  file: AgentTraceRawFile,
  content: string,
): AgentTraceRawFile => ({
  ...file,
  content,
  sizeBytes: Buffer.byteLength(content, "utf8"),
});
