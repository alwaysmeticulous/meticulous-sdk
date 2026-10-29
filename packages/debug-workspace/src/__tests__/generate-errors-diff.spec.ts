import {
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
import type { DebugContext } from "../debug.types";
import { generateErrorsDiff } from "../generate-errors-diff";

const DEBUG_CONTEXT = {
  replayDiffs: [
    {
      id: "rd",
      headReplayId: "head1",
      baseReplayId: "base1",
      sessionId: "s",
      numScreenshotDiffs: 1,
    },
  ],
} as unknown as DebugContext;

const uncaught = (vt: number, message: string) => ({
  kind: "error",
  virtualTimeStart: vt,
  virtualTimeEnd: vt,
  data: {
    type: "unhandled-window-error",
    message,
    mappedStack: [
      {
        functionName: "useUser",
        file: "src/useUser.ts",
        line: 12,
        column: 5,
        resolved: true,
      },
    ],
  },
});

// Rejections are never source-mapped: they only carry the raw stack.
const rejection = (vt: number, message: string) => ({
  kind: "error",
  virtualTimeStart: vt,
  virtualTimeEnd: vt,
  data: {
    type: "unhandled-promise-rejection",
    message,
    nativeStack: `Error: ${message}\n    at loadUser (https://app.test/main.js:1:2345)\n    at async init (https://app.test/main.js:1:678)`,
  },
});

const puppeteerPageError = (vt: number, message: string) => ({
  kind: "error",
  virtualTimeStart: vt,
  virtualTimeEnd: vt,
  data: { type: "unhandled-error", message },
});

const consoleError = (vt: number, message: string) => ({
  kind: "consoleMessage",
  virtualTimeStart: vt,
  virtualTimeEnd: vt,
  data: { type: "error", message },
});

describe("generateErrorsDiff", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "errors-diff-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  const writeTimeline = (
    role: string,
    replayId: string,
    entries: unknown[],
  ) => {
    const dir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      role,
      replayId,
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "timeline.ndjson"),
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
  };

  const readOutput = (label = "head1-vs-base1") =>
    readFileSync(
      join(workspace, DEBUG_DATA_DIRECTORY, "errors-diff", `${label}.txt`),
      "utf8",
    );

  it("marks each error by the replay that logged it, head-only first", () => {
    writeTimeline("head", "head1", [
      consoleError(10, "Failed to load resource 1234"),
      uncaught(
        500,
        "TypeError: Cannot read properties of undefined (reading 'user')",
      ),
      puppeteerPageError(
        500,
        "TypeError: Cannot read properties of undefined (reading 'user')",
      ),
    ]);
    writeTimeline("base", "base1", [
      consoleError(12, "Failed to load resource 5678"),
      consoleError(900, "Warning: legacy context"),
    ]);

    generateErrorsDiff(DEBUG_CONTEXT, workspace);

    expect(readOutput()).toContain(
      [
        "== Uncaught errors and unhandled promise rejections (1)",
        "head-only x1 (first: head vt=500 [1]) unhandled-window-error: TypeError: Cannot read properties of undefined (reading 'user')",
        "    at useUser (src/useUser.ts:12:5)",
        "",
        "== console.error messages (2)",
        "base-only x1 (first: base vt=900 [1]) console.error: Warning: legacy context",
        "both (head x1, base x1) (first: head vt=10 [0], base vt=12 [0]) console.error: Failed to load resource 1234",
      ].join("\n"),
    );
  });

  it("shows an unhandled rejection's raw stack, marked unmapped", () => {
    writeTimeline("head", "head1", [rejection(40, "Request failed")]);
    writeTimeline("base", "base1", []);

    generateErrorsDiff(DEBUG_CONTEXT, workspace);

    expect(readOutput()).toContain(
      [
        "head-only x1 (first: head vt=40 [0]) unhandled-promise-rejection: Request failed",
        "    at loadUser (https://app.test/main.js:1:2345) [unmapped]",
        "    at async init (https://app.test/main.js:1:678) [unmapped]",
      ].join("\n"),
    );
  });

  it("keeps short error codes apart but groups messages differing only by an ID", () => {
    writeTimeline("head", "head1", [
      consoleError(1, "Minified React error #310"),
      consoleError(
        2,
        "Request 550e8400-e29b-41d4-a716-446655440000 failed after 1500ms",
      ),
    ]);
    writeTimeline("base", "base1", [
      consoleError(1, "Minified React error #300"),
      consoleError(
        2,
        "Request 6ba7b810-9dad-11d1-80b4-00c04fd430c8 failed after 1700ms",
      ),
    ]);

    generateErrorsDiff(DEBUG_CONTEXT, workspace);

    const output = readOutput();
    expect(output).toContain("== console.error messages (3)");
    expect(output).toContain(
      "head-only x1 (first: head vt=1 [0]) console.error: Minified React error #310",
    );
    expect(output).toContain(
      "base-only x1 (first: base vt=1 [0]) console.error: Minified React error #300",
    );
    expect(output).toContain("both (head x1, base x1)");
  });

  it("groups failed loads of the same resource path whatever its numbers or query", () => {
    const failedAvatar = (vt: number, n: number) =>
      consoleError(
        vt,
        `Failed to load resource, the server responded with a status of 401 (Unauthorized): https://accounts.example/login?continue=https://cdn.example/avatars/${n}.png`,
      );
    const reactError = (vt: number, code: number) =>
      consoleError(
        vt,
        `Minified React error #${code}; visit https://react.dev/errors/${code} for the full message`,
      );
    writeTimeline("head", "head1", [
      failedAvatar(1, 28),
      failedAvatar(2, 58),
      reactError(3, 310),
    ]);
    writeTimeline("base", "base1", [failedAvatar(1, 7), reactError(3, 300)]);

    generateErrorsDiff(DEBUG_CONTEXT, workspace);

    const output = readOutput();
    expect(output).toContain("== console.error messages (3)");
    expect(output).toContain(
      "both (head x2, base x1) (first: head vt=1 [0], base vt=1 [0]) console.error: Failed to load resource",
    );
    expect(output).toContain("head-only x1");
    expect(output).toContain("base-only x1");
  });

  it("compares the two replays given by ID when there is no replay diff", () => {
    writeTimeline("other", "replayA", [rejection(40, "Request failed")]);
    writeTimeline("other", "replayB", []);

    generateErrorsDiff(
      {
        replayDiffs: [],
        replayIds: ["replayA", "replayB"],
      } as unknown as DebugContext,
      workspace,
    );

    expect(readOutput("replayA-vs-replayB")).toContain(
      "head-only x1 (first: head vt=40 [0]) unhandled-promise-rejection: Request failed",
    );
  });

  it("says so when neither replay logged any errors", () => {
    writeTimeline("head", "head1", []);
    writeTimeline("base", "base1", []);

    generateErrorsDiff(DEBUG_CONTEXT, workspace);

    expect(readOutput()).toContain("none in either replay");
  });
});
