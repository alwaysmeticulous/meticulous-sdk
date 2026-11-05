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
import type { RepoCoverageResult } from "../fetch-repo-coverage";
import { generateCoverageDiff } from "../generate-coverage-diff";
import type { LineRange } from "../line-ranges";

const debugContext = (screenshot?: string) =>
  ({
    screenshot,
    replayDiffs: [
      {
        id: "rd",
        headReplayId: "head1",
        baseReplayId: "base1",
        sessionId: "s",
        numScreenshotDiffs: 1,
      },
    ],
  }) as unknown as DebugContext;

const PR_DIFF = [
  "diff --git a/apps/web/src/Status.tsx b/apps/web/src/Status.tsx",
  "index 1..2 100644",
  "--- a/apps/web/src/Status.tsx",
  "+++ b/apps/web/src/Status.tsx",
  "@@ -10,3 +10,4 @@ export const Status = () => {",
  "   const row = useRow();",
  "-  const pill = derivePill(row);",
  "+  const pill = row.operationalStatus;",
  "+  if (!pill) return null;",
  "   return <Pill value={pill} />;",
  "",
].join("\n");

const available = (
  head: Array<[string, LineRange[]]>,
  base: Array<[string, LineRange[]]>,
): RepoCoverageResult => ({
  kind: "available",
  head: new Map(head),
  base: new Map(base),
});

describe("generateCoverageDiff", () => {
  let workspace: string;
  let debugData: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "coverage-diff-"));
    debugData = join(workspace, DEBUG_DATA_DIRECTORY);
    mkdirSync(debugData, { recursive: true });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  const readOutput = () =>
    readFileSync(
      join(debugData, "coverage-diff", "head1-vs-base1.txt"),
      "utf8",
    );

  it("reports executed PR lines, one-sided files and differing lines by repo path", () => {
    writeFileSync(join(debugData, "pr-diff.txt"), PR_DIFF);

    generateCoverageDiff(debugContext(), workspace, {
      "head1-vs-base1": {
        wholeReplay: available(
          [
            ["apps/web/src/Status.tsx", [[1, 11]]],
            ["apps/web/src/NewBanner.tsx", [[1, 20]]],
            [
              "apps/web/src/shared.ts",
              [
                [1, 10],
                [20, 30],
              ],
            ],
          ],
          [
            ["apps/web/src/Status.tsx", [[1, 12]]],
            ["apps/web/src/shared.ts", [[1, 25]]],
          ],
        ),
        screenshot: null,
      },
    });

    expect(readOutput()).toContain(
      [
        "=== Whole replay",
        "",
        "== Lines the PR changed that executed",
        "apps/web/src/Status.tsx",
        "  head: 1 of 2 added lines executed: 11",
        "  base: 1 of 1 removed lines executed: 11",
        "",
        "== Files executed in only one replay (head-only 1, base-only 0)",
        "head-only apps/web/src/NewBanner.tsx",
        "",
        "== Files executed in both with different lines (1)",
        "apps/web/src/shared.ts  head-only: 26-30  base-only: 11-19",
      ].join("\n"),
    );
  });

  it("says a PR file that has no coverage didn't execute", () => {
    writeFileSync(join(debugData, "pr-diff.txt"), PR_DIFF);

    generateCoverageDiff(debugContext(), workspace, {
      "head1-vs-base1": {
        wholeReplay: available([], []),
        screenshot: null,
      },
    });

    expect(readOutput()).toContain(
      [
        "apps/web/src/Status.tsx",
        "  head: file not executed (2 added lines)",
        "  base: file not executed (1 removed lines)",
      ].join("\n"),
    );
  });

  it("says a deleted or moved file's removed lines have unknown coverage", () => {
    writeFileSync(
      join(debugData, "pr-diff.txt"),
      [
        "diff --git a/src/Old.tsx b/src/Old.tsx",
        "deleted file mode 100644",
        "--- a/src/Old.tsx",
        "+++ /dev/null",
        "@@ -1,2 +0,0 @@",
        "-export const Old = () => null;",
        "-export default Old;",
        "diff --git a/src/Before.tsx b/src/After.tsx",
        "--- a/src/Before.tsx",
        "+++ b/src/After.tsx",
        "@@ -1,1 +1,1 @@",
        "-export const A = 1;",
        "+export const A = 2;",
        "",
      ].join("\n"),
    );

    generateCoverageDiff(debugContext(), workspace, {
      "head1-vs-base1": {
        wholeReplay: available([["src/After.tsx", [[1, 1]]]], []),
        screenshot: null,
      },
    });

    expect(readOutput()).toContain(
      [
        "src/Old.tsx",
        "  head: no added lines",
        "  base: coverage unknown (2 removed lines): the PR deleted this file, and coverage maps only to head's paths",
        "src/After.tsx",
        "  head: 1 of 1 added lines executed: 1",
        "  base: coverage unknown (1 removed lines): the PR moved this file, and coverage maps only to head's paths",
      ].join("\n"),
    );
  });

  it("states why coverage is unavailable instead of comparing", () => {
    generateCoverageDiff(debugContext(), workspace, {
      "head1-vs-base1": {
        wholeReplay: { kind: "unavailable", reason: "403 Forbidden" },
        screenshot: null,
      },
    });

    expect(readOutput()).toContain(
      ["=== Whole replay", "  coverage unavailable: 403 Forbidden"].join("\n"),
    );
  });

  it("states why the targeted screenshot's coverage is unavailable", () => {
    generateCoverageDiff(debugContext("after-event-552"), workspace, {
      "head1-vs-base1": {
        wholeReplay: available([["a.ts", [[1, 2]]]], [["a.ts", [[1, 2]]]]),
        screenshot: { kind: "unavailable", reason: "404 Not Found" },
      },
    });

    expect(readOutput()).toContain(
      [
        "=== Screenshot after-event-552",
        "  coverage unavailable: 404 Not Found",
      ].join("\n"),
    );
  });

  it("compares the targeted screenshot's own coverage too", () => {
    generateCoverageDiff(debugContext("final-state-v2.png"), workspace, {
      "head1-vs-base1": {
        wholeReplay: available([["a.ts", [[1, 2]]]], [["a.ts", [[1, 2]]]]),
        screenshot: available([["b.ts", [[1, 5]]]], []),
      },
    });

    expect(readOutput()).toContain(
      [
        "=== Screenshot final-state-v2.png",
        "",
        "== Files executed in only one replay (head-only 1, base-only 0)",
        "head-only b.ts",
      ].join("\n"),
    );
  });
});
