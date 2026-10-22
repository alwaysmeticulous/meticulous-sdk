import type { Stats } from "fs";
import { readdir } from "fs/promises";
import { extname, join, resolve } from "path";
import type { SkippedTracePath, TraceFile } from "../trace-files.types";
import { statOrNull, toTraceFile } from "./stat-trace-file";

/** Raw files are held in memory as strings, which V8 caps at around 512 MiB. */
export const MAX_TRACE_FILE_BYTES = 256 * 1024 * 1024;

const TRACE_FILE_EXTENSIONS = new Set([".jsonl", ".json", ".txt"]);
const SKIPPED_DIR_NAMES = new Set(["node_modules", ".git"]);

interface CollectedTraceFiles {
  files: TraceFile[];
  skipped: SkippedTracePath[];
}

/**
 * Files named directly, plus every `.jsonl`, `.json` and `.txt` file under
 * the directories named, without following symlinked directories. A file
 * reached twice (e.g. through a symlink) is listed once.
 */
export const collectTraceFiles = async (
  paths: string[],
): Promise<CollectedTraceFiles> => {
  const collector = new TraceFileCollector();
  for (const input of paths) {
    const path = resolve(input);
    const stats = await statOrNull(path);
    if (!stats) {
      collector.skip(path, "not found");
    } else if (stats.isDirectory()) {
      await collector.crawl(path);
    } else if (stats.isFile()) {
      await collector.add(path, stats, true);
    } else {
      collector.skip(path, "not a file or directory");
    }
  }
  return { files: [...collector.files.values()], skipped: collector.skipped };
};

class TraceFileCollector {
  readonly files = new Map<string, TraceFile>();
  readonly skipped: SkippedTracePath[] = [];

  skip(path: string, reason: string): void {
    this.skipped.push({ path, reason });
  }

  async crawl(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      this.skip(dir, `unreadable: ${String(error)}`);
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIR_NAMES.has(entry.name)) {
          await this.crawl(path);
        }
        continue;
      }
      if (!TRACE_FILE_EXTENSIONS.has(extname(entry.name))) {
        continue;
      }
      const stats = await statOrNull(path);
      if (stats?.isFile()) {
        await this.add(path, stats, false);
      }
    }
  }

  async add(path: string, stats: Stats, explicit: boolean): Promise<void> {
    if (stats.size > MAX_TRACE_FILE_BYTES) {
      this.skip(path, `larger than ${MAX_TRACE_FILE_BYTES} bytes`);
      return;
    }
    const file = await toTraceFile(path, stats, explicit);
    const existing = this.files.get(file.realPath);
    if (existing) {
      existing.explicit ||= explicit;
      return;
    }
    this.files.set(file.realPath, file);
  }
}
