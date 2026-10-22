import { readFile } from "fs/promises";
import { join } from "path";
import { asNonEmptyString, asRecord } from "../utils/json-guards";
import { CODEX_SESSION_INDEX_FILE } from "./codex-home-layout";

/** The thread's latest name; the index is append-only, so the last entry wins. */
export const readCodexThreadName = async (
  codexHome: string,
  threadId: string,
): Promise<string | null> => {
  let text: string;
  try {
    text = await readFile(join(codexHome, CODEX_SESSION_INDEX_FILE), "utf8");
  } catch {
    return null;
  }
  let name: string | null = null;
  for (const line of text.split("\n")) {
    if (!line.includes(threadId)) {
      continue;
    }
    try {
      const entry = asRecord(JSON.parse(line));
      if (entry?.["id"] === threadId) {
        name = asNonEmptyString(entry["thread_name"]) ?? name;
      }
    } catch {
      // A torn final line; earlier entries still count.
    }
  }
  return name;
};
