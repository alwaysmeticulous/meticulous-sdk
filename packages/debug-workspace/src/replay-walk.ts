import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { ScreenshotIdentifier } from "./screenshot-identifier";

export type Role = "head" | "base" | "other";
export const ROLES: readonly Role[] = ["head", "base", "other"];

export interface ReplayDir {
  role: Role;
  replayId: string;
  path: string;
}

export interface DiscoverReplayDirsOptions {
  roles?: readonly Role[];
  requireTimeline?: boolean;
}

export const discoverReplayDirs = (
  replaysDir: string,
  options: DiscoverReplayDirsOptions = {},
): ReplayDir[] => {
  const dirs: ReplayDir[] = [];
  if (!existsSync(replaysDir)) {
    return dirs;
  }
  const roles = options.roles ?? ROLES;

  for (const role of roles) {
    const roleDir = join(replaysDir, role);
    if (!existsSync(roleDir)) {
      continue;
    }
    for (const replayId of readdirSync(roleDir)) {
      const path = join(roleDir, replayId);
      if (options.requireTimeline && !existsSync(join(path, "timeline.json"))) {
        continue;
      }
      dirs.push({ role, replayId, path });
    }
  }
  return dirs;
};

export interface TimelineEntry {
  kind: string;
  start?: number;
  end?: number;
  virtualTimeStart?: number;
  virtualTimeEnd?: number;
  data?: Record<string, unknown> & {
    identifier?: ScreenshotIdentifier;
  };
}

/** Returns `null` if the file is missing, unparseable, or not a JSON array. */
export const readTimelineJson = (
  timelinePath: string,
): TimelineEntry[] | null => {
  if (!existsSync(timelinePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(timelinePath, "utf-8"));
    return Array.isArray(parsed) ? (parsed as TimelineEntry[]) : null;
  } catch {
    return null;
  }
};

export interface ScreenshotMetadata {
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

/** Returns `null` if the file can't be read or parsed. */
export const readScreenshotMetadata = (
  metadataPath: string,
): ScreenshotMetadata | null => {
  try {
    return JSON.parse(
      readFileSync(metadataPath, "utf-8"),
    ) as ScreenshotMetadata;
  } catch {
    return null;
  }
};
