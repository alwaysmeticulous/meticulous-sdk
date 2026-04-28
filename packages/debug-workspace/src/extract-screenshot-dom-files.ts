import { existsSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";
import {
  discoverReplayDirs,
  readScreenshotMetadata,
  readTimelineJson,
  type ReplayDir,
} from "./replay-walk";
import { screenshotIdentifierToBaseName } from "./screenshot-identifier";

/**
 * Extract each `*.metadata.json`'s `before.dom` / `after.dom` into
 * `<name>.html` / `<name>.after.html`, prefixed with a one-line
 * `<!-- screenshot=... url=... vt=... -->` header.
 */
export const extractScreenshotDomFiles = (workspaceDir: string): void => {
  const debugDataDir = join(workspaceDir, DEBUG_DATA_DIRECTORY);
  const replaysDir = join(debugDataDir, "replays");
  const replayDirs = discoverReplayDirs(replaysDir);
  if (replayDirs.length === 0) {
    return;
  }

  let extractedCount = 0;
  let skippedMalformedCount = 0;

  for (const replayDir of replayDirs) {
    const screenshotsDir = join(replayDir.path, "screenshots");
    if (!existsSync(screenshotsDir)) {
      continue;
    }

    const virtualTimeByName = readTimelineVirtualTimes(
      join(replayDir.path, "timeline.json"),
    );

    for (const filename of readdirSync(screenshotsDir)) {
      if (!filename.endsWith(".metadata.json")) {
        continue;
      }
      const baseName = filename.slice(0, -".metadata.json".length);

      const metadata = readScreenshotMetadata(join(screenshotsDir, filename));
      if (metadata == null) {
        logMalformed(replayDir, filename);
        skippedMalformedCount++;
        continue;
      }

      const url = metadata.before?.routeData?.url ?? null;
      const virtualTime = virtualTimeByName.get(baseName) ?? null;

      const beforeDom = metadata.before?.dom;
      if (typeof beforeDom === "string") {
        writeFileSync(
          join(screenshotsDir, `${baseName}.html`),
          renderWithHeader(beforeDom, baseName, url, virtualTime, "before"),
        );
        extractedCount++;
      }

      const afterDom = metadata.after?.dom;
      if (typeof afterDom === "string") {
        writeFileSync(
          join(screenshotsDir, `${baseName}.after.html`),
          renderWithHeader(afterDom, baseName, url, virtualTime, "after"),
        );
        extractedCount++;
      }
    }
  }

  if (extractedCount > 0) {
    console.log(
      chalk.green(
        `  Extracted ${extractedCount} screenshot DOM snapshot(s) to screenshots/*.html`,
      ),
    );
  }
  if (skippedMalformedCount > 0) {
    console.log(
      chalk.yellow(
        `  Skipped ${skippedMalformedCount} malformed screenshot metadata file(s)`,
      ),
    );
  }
};

const renderWithHeader = (
  dom: string,
  baseName: string,
  url: string | null,
  virtualTime: number | null,
  side: "before" | "after",
): string => {
  const headerParts: string[] = [`screenshot=${baseName}`, `side=${side}`];
  if (url != null) {
    headerParts.push(`url=${url}`);
  }
  if (virtualTime != null) {
    headerParts.push(`vt=${virtualTime}`);
  }
  const header = `<!-- ${headerParts.join(" ")} -->\n`;
  return header + dom;
};

const readTimelineVirtualTimes = (
  timelinePath: string,
): Map<string, number> => {
  const map = new Map<string, number>();
  const timeline = readTimelineJson(timelinePath);
  if (timeline == null) {
    return map;
  }
  for (const entry of timeline) {
    if (entry.kind !== "screenshot" || !entry.data?.identifier) {
      continue;
    }
    const name = screenshotIdentifierToBaseName(entry.data.identifier);
    if (name == null || entry.virtualTimeStart == null) {
      continue;
    }
    map.set(name, entry.virtualTimeStart);
  }
  return map;
};

const logMalformed = (replayDir: ReplayDir, filename: string): void => {
  console.warn(
    chalk.yellow(
      `  Warning: Could not parse ${replayDir.role}/${replayDir.replayId}/screenshots/${filename}`,
    ),
  );
};
