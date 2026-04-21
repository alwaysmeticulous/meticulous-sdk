import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import chalk from "chalk";
import { DEBUG_DATA_DIRECTORY } from "./debug-constants";

type Role = "head" | "base" | "other";

const ROLES: Role[] = ["head", "base", "other"];

interface ScreenshotMetadataShape {
  date?: number;
  before?: {
    routeData?: { url?: string };
    dom?: string;
    hashOfClassNames?: string;
  };
  after?: {
    dom?: string;
  } | null;
}

interface TimelineEntryShape {
  kind: string;
  virtualTimeStart?: number;
  virtualTimeEnd?: number;
  data?: {
    identifier?: {
      type?: string;
      eventNumber?: number;
      logicVersion?: number | null;
      variant?: string | null;
    };
  };
}

/**
 * Extract per-screenshot HTML files from each `*.metadata.json`'s
 * `before.dom` / `after.dom` into `<name>.html` / `<name>.after.html`
 * alongside the metadata file, with a one-line `<!-- screenshot=...
 * url=... vt=... -->` header for grep-ability.
 *
 * Invariant: the header is for humans only. `computeDomDiffs` reads
 * the raw DOM from `metadata.json`, never from the header-prefixed
 * `.html` files, so per-replay metadata (URL, vt) cannot leak into
 * the DOM diff output.
 */
export const extractScreenshotDomFiles = (workspaceDir: string): void => {
  const debugDataDir = join(workspaceDir, DEBUG_DATA_DIRECTORY);
  const replaysDir = join(debugDataDir, "replays");
  if (!existsSync(replaysDir)) {
    return;
  }

  let extractedCount = 0;
  let skippedMalformedCount = 0;

  for (const role of ROLES) {
    const roleDir = join(replaysDir, role);
    if (!existsSync(roleDir)) {
      continue;
    }

    for (const replayId of readdirSync(roleDir)) {
      const screenshotsDir = join(roleDir, replayId, "screenshots");
      if (!existsSync(screenshotsDir)) {
        continue;
      }

      const timelinePath = join(roleDir, replayId, "timeline.json");
      const virtualTimeByName = readTimelineVirtualTimes(timelinePath);

      for (const filename of readdirSync(screenshotsDir)) {
        if (!filename.endsWith(".metadata.json")) {
          continue;
        }
        const baseName = filename.slice(0, -".metadata.json".length);

        let metadata: ScreenshotMetadataShape;
        try {
          const raw = readFileSync(join(screenshotsDir, filename), "utf-8");
          metadata = JSON.parse(raw) as ScreenshotMetadataShape;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            chalk.yellow(
              `  Warning: Could not parse ${role}/${replayId}/screenshots/${filename}: ${message}`,
            ),
          );
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
  const headerParts: string[] = [
    `screenshot=${baseName}`,
    `side=${side}`,
  ];
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
  if (!existsSync(timelinePath)) {
    return map;
  }
  let timeline: TimelineEntryShape[];
  try {
    timeline = JSON.parse(
      readFileSync(timelinePath, "utf-8"),
    ) as TimelineEntryShape[];
  } catch {
    return map;
  }
  if (!Array.isArray(timeline)) {
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

// Mirror of `screenshotIdentifierToFilename` in
// `generate-debug-workspace.ts` without the trailing `.png`. Any
// change here must match that function, since both produce the same
// `<screenshotBaseName>` used for dom-diffs/ and metadata lookups.
const screenshotIdentifierToBaseName = (identifier: {
  type?: string;
  eventNumber?: number;
  logicVersion?: number | null;
  variant?: string | null;
}): string | null => {
  const variantPortion = identifier.variant === "redacted" ? ".redacted" : "";

  if (identifier.type === "end-state") {
    return identifier.logicVersion == null
      ? `final-state${variantPortion}`
      : `final-state-v${identifier.logicVersion}${variantPortion}`;
  }

  if (identifier.type === "after-event" && identifier.eventNumber != null) {
    const eventIndexStr = identifier.eventNumber.toString().padStart(5, "0");
    return identifier.logicVersion == null
      ? `screenshot-after-event-${eventIndexStr}${variantPortion}`
      : `screenshot-after-event-${eventIndexStr}-v${identifier.logicVersion}${variantPortion}`;
  }

  return null;
};
