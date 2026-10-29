import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";

interface ComparedScreenshotFields {
  width?: number;
  height?: number;
  mismatchPixels?: number;
  mismatchFraction?: number;
  diffHash?: string;
  changedSectionsClassNames?: string[];
}

interface DiffScreenshotResult extends ComparedScreenshotFields {
  identifier: unknown;
  outcome: string;
  evidence?: string;
  diffInBoundingBoxOfIgnoredElement?: boolean;
  /** Only on `flake` results, which carry the original comparison here. */
  diffToBaseScreenshot?: ComparedScreenshotFields;
}

/**
 * Writes a compact `diffs/<id>.summary.json` next to each downloaded replay
 * diff, with just the per-screenshot comparison results.
 */
export const generateDiffSummaries = (workspaceDir: string): void => {
  const diffsDir = join(workspaceDir, DEBUG_DATA_DIRECTORY, "diffs");
  if (!existsSync(diffsDir)) {
    return;
  }

  let count = 0;
  const jsonFiles = readdirSync(diffsDir).filter(
    (f) => f.endsWith(".json") && !f.endsWith(".summary.json"),
  );

  for (const file of jsonFiles) {
    const raw = JSON.parse(readFileSync(join(diffsDir, file), "utf8")) as {
      data?: { screenshotDiffResults?: DiffScreenshotResult[] };
    };

    const results = raw?.data?.screenshotDiffResults ?? [];
    if (results.length === 0) {
      continue;
    }

    const summaryFile = file.replace(".json", ".summary.json");
    writeFileSync(
      join(diffsDir, summaryFile),
      JSON.stringify(results.map(summarizeScreenshotResult), null, 2),
    );
    count++;
  }

  if (count > 0) {
    console.log(
      chalk.green(`  Generated ${count} compact diff summary(ies) in diffs/`),
    );
  }
};

const summarizeScreenshotResult = (result: DiffScreenshotResult) => {
  const compared = result.diffToBaseScreenshot ?? result;
  return {
    identifier: result.identifier,
    outcome: result.outcome,
    evidence: result.evidence,
    width: compared.width,
    height: compared.height,
    mismatchPixels: compared.mismatchPixels,
    mismatchFraction: compared.mismatchFraction,
    mismatchPercent:
      compared.mismatchFraction != null
        ? `${(compared.mismatchFraction * 100).toFixed(4)}%`
        : undefined,
    diffHash: compared.diffHash,
    diffInBoundingBoxOfIgnoredElement: result.diffInBoundingBoxOfIgnoredElement,
    changedSectionsClassNames: compared.changedSectionsClassNames,
  };
};
