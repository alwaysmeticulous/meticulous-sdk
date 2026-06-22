import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureReplayLogTextFiles } from "../replay-log-text-files";

describe("ensureReplayLogTextFiles", () => {
  let replayDir: string;

  beforeEach(() => {
    replayDir = mkdtempSync(join(tmpdir(), "met-ensure-log-txt-"));
  });

  afterEach(() => {
    rmSync(replayDir, { recursive: true, force: true });
  });

  const writeNdjson = (entries: Record<string, unknown>[]): void => {
    writeFileSync(
      join(replayDir, "logs.ndjson"),
      entries.map((e) => JSON.stringify(e)).join("\n"),
    );
  };

  it("is a no-op when logs.ndjson is missing", async () => {
    await ensureReplayLogTextFiles(replayDir);

    expect(existsSync(join(replayDir, "logs.concise.txt"))).toBe(false);
    expect(existsSync(join(replayDir, "logs.deterministic.txt"))).toBe(false);
  });

  it("writes both text files when only logs.ndjson is present", async () => {
    writeNdjson([
      { type: "virtual-time-change", virtualTime: 100 },
      {
        type: "console",
        source: "application",
        stackTraceId: "abc",
        message: "hello",
        realTime: 5,
      },
      {
        type: "console",
        source: "browser",
        stackTraceId: "def",
        message: "[non-deterministic] timestamp=123",
        realTime: 10,
      },
    ]);

    await ensureReplayLogTextFiles(replayDir);

    const concise = readFileSync(join(replayDir, "logs.concise.txt"), "utf8");
    const deterministic = readFileSync(
      join(replayDir, "logs.deterministic.txt"),
      "utf8",
    );

    // Concise keeps both messages (no [non-deterministic] filter).
    expect(concise).toContain("[application]");
    expect(concise).toContain("hello");
    expect(concise).toContain("[non-deterministic] timestamp=123");
    // Deterministic strips real-time and skips [non-deterministic] lines.
    expect(deterministic).toContain("hello");
    expect(deterministic).not.toContain("[non-deterministic]");
    expect(deterministic).not.toMatch(/real:/);
  });

  it("is a no-op when both text files already exist (idempotent)", async () => {
    writeNdjson([
      {
        type: "console",
        source: "browser",
        stackTraceId: "abc",
        message: "fresh",
        realTime: 1,
      },
    ]);
    const conciseSentinel = "previously-rendered-concise";
    const deterministicSentinel = "previously-rendered-deterministic";
    writeFileSync(join(replayDir, "logs.concise.txt"), conciseSentinel);
    writeFileSync(
      join(replayDir, "logs.deterministic.txt"),
      deterministicSentinel,
    );

    await ensureReplayLogTextFiles(replayDir);

    expect(readFileSync(join(replayDir, "logs.concise.txt"), "utf8")).toBe(
      conciseSentinel,
    );
    expect(
      readFileSync(join(replayDir, "logs.deterministic.txt"), "utf8"),
    ).toBe(deterministicSentinel);
  });

  it("regenerates both files when only one exists", async () => {
    writeNdjson([
      {
        type: "console",
        source: "browser",
        stackTraceId: "abc",
        message: "regenerate",
        realTime: 1,
      },
    ]);
    writeFileSync(join(replayDir, "logs.concise.txt"), "stale");

    await ensureReplayLogTextFiles(replayDir);

    expect(readFileSync(join(replayDir, "logs.concise.txt"), "utf8")).toContain(
      "regenerate",
    );
    expect(
      readFileSync(join(replayDir, "logs.deterministic.txt"), "utf8"),
    ).toContain("regenerate");
  });
});
