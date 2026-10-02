import { createReadStream } from "fs";
import type * as fs from "fs";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  // Spied rather than fully mocked, so the ndjson file is still genuinely
  // read from disk: only whether the returned stream gets destroyed is
  // asserted on.
  return { ...actual, createReadStream: vi.fn(actual.createReadStream) };
});
import {
  forEachTimelineEntryInNdjsonFile,
  parseTimelineNdjson,
  readReplayTimelineFileSync,
  readReplayTimelineFromDir,
  resolveReplayTimelineFile,
  timelineFormatForFileName,
} from "../replay-timeline";

const entries = [
  { kind: "urlChange", start: 0, end: 0, data: { url: "/a" } },
  { kind: "urlChange", start: 1, end: 1, data: { url: "/b" } },
];
const ndjson = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
const json = JSON.stringify(entries);

describe("replay timeline readers", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "replay-timeline-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("prefers timeline.ndjson when both forms are present", async () => {
    await writeFile(join(dir, "timeline.ndjson"), ndjson);
    await writeFile(join(dir, "timeline.json"), "[]");

    expect(resolveReplayTimelineFile(dir)).toEqual({
      path: join(dir, "timeline.ndjson"),
      format: "ndjson",
    });
    await expect(readReplayTimelineFromDir(dir)).resolves.toEqual(entries);
  });

  it("falls back to timeline.json for replays that predate the ndjson artifact", async () => {
    await writeFile(join(dir, "timeline.json"), json);

    expect(resolveReplayTimelineFile(dir)).toEqual({
      path: join(dir, "timeline.json"),
      format: "json",
    });
    await expect(readReplayTimelineFromDir(dir)).resolves.toEqual(entries);
    expect(
      readReplayTimelineFileSync({
        path: join(dir, "timeline.json"),
        format: "json",
      }),
    ).toEqual(entries);
  });

  it("reports a directory with no timeline", async () => {
    expect(resolveReplayTimelineFile(dir)).toBeNull();
    await expect(readReplayTimelineFromDir(dir)).rejects.toThrow(
      "No timeline.ndjson or timeline.json",
    );
  });

  it("reads ndjson synchronously, tolerating CRLF and blank lines", async () => {
    await writeFile(
      join(dir, "timeline.ndjson"),
      entries.map((e) => JSON.stringify(e)).join("\r\n") + "\r\n\r\n",
    );
    expect(
      readReplayTimelineFileSync({
        path: join(dir, "timeline.ndjson"),
        format: "ndjson",
      }),
    ).toEqual(entries);
    expect(parseTimelineNdjson("")).toEqual([]);
  });

  it("streams ndjson one entry at a time and surfaces malformed lines", async () => {
    const path = join(dir, "timeline.ndjson");
    await writeFile(path, ndjson);
    const seen: unknown[] = [];
    await forEachTimelineEntryInNdjsonFile(path, (e) => seen.push(e));
    expect(seen).toEqual(entries);

    await writeFile(path, `${JSON.stringify(entries[0])}\nnot json\n`);
    vi.mocked(createReadStream).mockClear();
    await expect(
      forEachTimelineEntryInNdjsonFile(path, () => undefined),
    ).rejects.toThrow();
    // The throw exits the for-await early; the underlying stream must still
    // be released.
    const createReadStreamMock = vi.mocked(createReadStream);
    expect(createReadStreamMock).toHaveBeenCalledTimes(1);
    const stream = createReadStreamMock.mock.results[0]?.value as ReturnType<
      typeof createReadStream
    >;
    expect(stream.destroyed).toBe(true);
  });

  it("streams entries whose strings contain unescaped U+2028 / U+2029", async () => {
    const path = join(dir, "timeline.ndjson");
    const withSeparators = [
      { kind: "consoleMessage", data: { message: "a b" } },
      { kind: "consoleMessage", data: { message: "c d" } },
    ];
    const content =
      withSeparators.map((e) => JSON.stringify(e)).join("\n") + "\n";
    expect(content).toContain(" ");
    await writeFile(path, content);

    const seen: unknown[] = [];
    await forEachTimelineEntryInNdjsonFile(path, (e) => seen.push(e));
    expect(seen).toEqual(withSeparators);
  });

  it("streams CRLF lines, entries spanning chunks, and a missing trailing newline", async () => {
    const path = join(dir, "timeline.ndjson");
    // Each entry is well past the 64KiB read chunk size, and the multi-byte
    // characters make chunk boundaries land mid-character too.
    const large = [
      { kind: "pollyReplay", data: { body: "é ".repeat(50_000) } },
      { kind: "pollyReplay", data: { body: "x".repeat(200_000) } },
      ...entries,
    ];
    await writeFile(
      path,
      large.map((e) => JSON.stringify(e)).join("\r\n") + "\r\n\r\n",
    );
    const seen: unknown[] = [];
    await forEachTimelineEntryInNdjsonFile(path, (e) => seen.push(e));
    expect(seen).toEqual(large);

    await writeFile(path, ndjson.trimEnd());
    const seenWithoutTrailingNewline: unknown[] = [];
    await forEachTimelineEntryInNdjsonFile(path, (e) =>
      seenWithoutTrailingNewline.push(e),
    );
    expect(seenWithoutTrailingNewline).toEqual(entries);
  });

  it("infers the format from the extracted file name", () => {
    expect(timelineFormatForFileName("timeline.ndjson")).toBe("ndjson");
    expect(timelineFormatForFileName("timeline.json")).toBe("json");
  });
});
