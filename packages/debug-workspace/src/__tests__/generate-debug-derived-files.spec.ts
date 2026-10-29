import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEBUG_DATA_DIRECTORY } from "../debug-constants";
import { generateDebugDerivedFiles } from "../generate-debug-derived-files";

const request = (
  url: string,
  virtualTimeStart: number,
  virtualTimeEnd: number,
) => ({
  kind: "pollyReplay",
  virtualTimeStart,
  virtualTimeEnd,
  data: {
    result: "success",
    pollyRequest: { request: { method: "GET", url } },
    matchedRequest: { response: { status: 200 } },
  },
});

// Stored in the order the entries were reported: a request is reported when
// it completes, after the screenshot that followed its start.
const TIMELINE = [
  {
    kind: "urlChange",
    virtualTimeStart: 0,
    virtualTimeEnd: 0,
    data: { url: "https://example.com/start" },
  },
  request("https://example.com/second", 50, 400),
  {
    kind: "screenshot",
    virtualTimeStart: 200,
    virtualTimeEnd: 200,
    data: { identifier: { type: "after-event", eventNumber: 1 } },
  },
  request("https://example.com/first", 20, 500),
];

describe("generateDebugDerivedFiles", () => {
  let workspace: string;
  let debugDataDir: string;
  let timelineNdjson: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "met-debug-derived-"));
    debugDataDir = join(workspace, DEBUG_DATA_DIRECTORY);
    const replayDir = join(debugDataDir, "replays", "head", "replay-1");
    mkdirSync(replayDir, { recursive: true });
    timelineNdjson =
      TIMELINE.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
    writeFileSync(join(replayDir, "timeline.ndjson"), timelineNdjson);
    generateDebugDerivedFiles(workspace);
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  const readLines = (...path: string[]) =>
    readFileSync(join(debugDataDir, ...path), "utf-8")
      .trimEnd()
      .split("\n");

  it("lists events in virtual time order, numbered by their index in timeline.ndjson", () => {
    expect(
      readLines("events-index", "head-replay-1.txt").map((line) =>
        line.slice(0, line.indexOf(" kind=")),
      ),
    ).toEqual(["[0] vt=0", "[3] vt=20-500", "[1] vt=50-400", "[2] vt=200"]);
  });

  it("lists network requests in the order they started", () => {
    expect(readLines("network-log", "head-replay-1.txt")).toEqual([
      "[3] vt=20-500 GET https://example.com/first -> 200 (success)",
      "[1] vt=50-400 GET https://example.com/second -> 200 (success)",
    ]);
  });

  it("shows the events that started before a screenshot as its preceding context", () => {
    const lines = readLines(
      "screenshot-timeline-context",
      "head-replay-1-screenshot-after-event-00001.txt",
    );

    expect(lines[0]).toContain("timeline.ndjson index 2");
    expect(lines.slice(3).map((line) => line.split(" vt=")[0])).toEqual([
      "    [0]",
      "    [3]",
      "    [1]",
      ">>> [2]",
    ]);
  });

  it("leaves timeline.ndjson in the order it was stored", () => {
    expect(
      readFileSync(
        join(debugDataDir, "replays", "head", "replay-1", "timeline.ndjson"),
        "utf-8",
      ),
    ).toBe(timelineNdjson);
  });
});

describe("generateDebugDerivedFiles error entries", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "met-debug-derived-errors-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("keeps a multi-line error on one events-index line, with its top source-mapped frame", () => {
    const replayDir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      "replay-1",
    );
    mkdirSync(replayDir, { recursive: true });
    const error = {
      kind: "error",
      virtualTimeStart: 0,
      virtualTimeEnd: 0,
      data: {
        type: "unhandled-error",
        message: "Could not create a contributor.\nfunction0",
        mappedStack: [
          {
            functionName: "findContributor",
            file: "examples/advanced.tsx",
            line: 146,
            column: 1,
            resolved: true,
          },
        ],
      },
    };
    writeFileSync(
      join(replayDir, "timeline.ndjson"),
      JSON.stringify(error) + "\n",
    );

    generateDebugDerivedFiles(workspace);

    expect(
      readFileSync(
        join(
          workspace,
          DEBUG_DATA_DIRECTORY,
          "events-index",
          "head-replay-1.txt",
        ),
        "utf-8",
      ),
    ).toBe(
      "[0] vt=0 kind=error Could not create a contributor. function0 at findContributor (examples/advanced.tsx:146:1)\n",
    );
  });
});

describe("generateDebugDerivedFiles end-state screenshots", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "met-debug-derived-end-state-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("names an end-state screenshot as its file is named", () => {
    const debugDataDir = join(workspace, DEBUG_DATA_DIRECTORY);
    const replayDir = join(debugDataDir, "replays", "head", "replay-1");
    mkdirSync(replayDir, { recursive: true });
    const screenshot = {
      kind: "screenshot",
      virtualTimeStart: 900,
      virtualTimeEnd: 900,
      data: { identifier: { type: "end-state", logicVersion: 2 } },
    };
    writeFileSync(
      join(replayDir, "timeline.ndjson"),
      JSON.stringify(screenshot) + "\n",
    );

    generateDebugDerivedFiles(workspace);

    expect(
      readFileSync(
        join(debugDataDir, "events-index", "head-replay-1.txt"),
        "utf-8",
      ),
    ).toBe("[0] vt=900 kind=screenshot id=final-state-v2\n");
    expect(
      existsSync(
        join(
          debugDataDir,
          "screenshot-timeline-context",
          "head-replay-1-final-state-v2.txt",
        ),
      ),
    ).toBe(true);
  });
});
