import {
  readReplayTimelineFileSync,
  resolveReplayTimelineFile,
} from "@alwaysmeticulous/downloading-helpers";
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
      if (options.requireTimeline && resolveReplayTimelineFile(path) == null) {
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

/**
 * The replay directory's timeline (`timeline.ndjson`, or `timeline.json` for
 * replays that predate it). Returns `null` if neither file is present, or the
 * one found is unparseable or not a list of entries.
 */
export const readReplayTimeline = (
  replayDir: string,
): TimelineEntry[] | null => {
  const file = resolveReplayTimelineFile(replayDir);
  if (file == null) {
    return null;
  }
  try {
    const parsed = readReplayTimelineFileSync<unknown>(file);
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
