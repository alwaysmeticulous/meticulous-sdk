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
import { generateCoverageDiff } from "../generate-coverage-diff";

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

  const writeCoverage = (
    role: string,
    replayId: string,
    relativePath: string,
    coverage: unknown,
  ) => {
    const path = join(debugData, "replays", role, replayId, relativePath);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(coverage));
  };

  const readOutput = () =>
    readFileSync(
      join(debugData, "coverage-diff", "head1-vs-base1.txt"),
      "utf8",
    );

  it("reports executed PR lines, one-sided files and differing lines", () => {
    writeFileSync(join(debugData, "pr-diff.txt"), PR_DIFF);
    writeCoverage("head", "head1", "mapped-coverage.json", [
      ["src/Status.tsx", [[1, 11]]],
      ["src/NewBanner.tsx", [[1, 20]]],
      [
        "src/shared.ts",
        [
          [1, 10],
          [20, 30],
        ],
      ],
    ]);
    writeCoverage("base", "base1", "mapped-coverage.json", [
      ["src/Status.tsx", [[1, 12]]],
      ["src/shared.ts", [[1, 25]]],
    ]);

    generateCoverageDiff(debugContext(), workspace);

    expect(readOutput()).toContain(
      [
        "=== Whole replay (mapped-coverage.json)",
        "",
        "== Lines the PR changed that executed",
        "apps/web/src/Status.tsx",
        "  head: 1 of 2 added lines executed: 11",
        "  base: 1 of 1 removed lines executed: 11",
        "",
        "== Files executed in only one replay (head-only 1, base-only 0)",
        "head-only src/NewBanner.tsx",
        "",
        "== Files executed in both with different lines (1)",
        "src/shared.ts  head-only: 26-30  base-only: 11-19",
      ].join("\n"),
    );
  });

  const prDiffAdding = (path: string, line: number) =>
    [
      `diff --git a/${path} b/${path}`,
      "index 1..2 100644",
      `--- a/${path}`,
      `+++ b/${path}`,
      `@@ -${line},0 +${line},1 @@`,
      "+  added();",
      "",
    ].join("\n");

  it("prefers the exact path over longer paths ending with it", () => {
    writeFileSync(
      join(debugData, "pr-diff.txt"),
      prDiffAdding("src/index.ts", 5),
    );
    const coverage = [
      ["apps/admin/src/index.ts", [[1, 2]]],
      ["packages/web/src/index.ts", [[1, 2]]],
      ["src/index.ts", [[1, 10]]],
    ];
    writeCoverage("head", "head1", "mapped-coverage.json", coverage);
    writeCoverage("base", "base1", "mapped-coverage.json", coverage);

    generateCoverageDiff(debugContext(), workspace);

    expect(readOutput()).toContain(
      ["src/index.ts", "  head: 1 of 1 added lines executed: 5"].join("\n"),
    );
  });

  it("says so rather than guessing between several nested matches", () => {
    writeFileSync(
      join(debugData, "pr-diff.txt"),
      prDiffAdding("src/index.ts", 5),
    );
    const coverage = [
      ["packages/a/src/index.ts", [[1, 10]]],
      ["packages/b/src/index.ts", [[1, 2]]],
    ];
    writeCoverage("head", "head1", "mapped-coverage.json", coverage);
    writeCoverage("base", "base1", "mapped-coverage.json", coverage);

    generateCoverageDiff(debugContext(), workspace);

    expect(readOutput()).toContain(
      "  head: can't tell which coverage file this is (packages/a/src/index.ts, packages/b/src/index.ts)",
    );
  });

  it("compares the targeted screenshot's own coverage too", () => {
    writeCoverage("head", "head1", "mapped-coverage.json", [
      ["a.ts", [[1, 2]]],
    ]);
    writeCoverage("base", "base1", "mapped-coverage.json", [
      ["a.ts", [[1, 2]]],
    ]);
    writeCoverage(
      "head",
      "head1",
      "mapped-per-screenshot-js-coverage/final-state-v2.json",
      [["b.ts", [[1, 5]]]],
    );
    writeCoverage(
      "base",
      "base1",
      "mapped-per-screenshot-js-coverage/final-state-v2.json",
      [],
    );

    generateCoverageDiff(debugContext("final-state-v2.png"), workspace);

    expect(readOutput()).toContain(
      [
        "=== Screenshot final-state-v2.png (mapped-per-screenshot-js-coverage/final-state-v2.json)",
        "",
        "== Files executed in only one replay (head-only 1, base-only 0)",
        "head-only b.ts",
      ].join("\n"),
    );
  });
});
