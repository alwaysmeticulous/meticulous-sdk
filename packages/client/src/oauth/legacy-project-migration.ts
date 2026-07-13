import { existsSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { getMeticulousLocalDataDir } from "@alwaysmeticulous/common";
import type log from "loglevel";
import {
  getOAuthDefaultProject,
  setOAuthDefaultProject,
} from "../api/oauth.api";
import { buildClient } from "../client";

// Where the pre-backend CLI stored the selected project.
const getLegacySelectedProjectFilePath = (): string =>
  join(getMeticulousLocalDataDir(), "selected-project.json");

/**
 * One-time migration for CLIs upgrading from the local-file default project
 * (`selected-project.json`) to the backend-persisted per-user setting.
 *
 * When the legacy file is present and the account has no *stored* default
 * server-side (checked with `includeAutoPick: false`, so a transient
 * sole-project auto-pick does not count — see the inline note below), its
 * project is pushed up as the new default. A stored default set on another
 * machine / the web takes precedence. The file is then removed so this runs at
 * most once per machine.
 *
 * Entirely best-effort: any failure (unreadable file, network, older backend)
 * is swallowed and the file left in place to retry — a missed migration just
 * means the user re-runs `auth set-project`, which is the pre-migration status
 * quo. A corrupt file is discarded.
 */
export const migrateLegacySelectedProjectIfPresent = async (
  apiToken: string,
  logger: log.Logger,
  appInfo?: string,
): Promise<void> => {
  const filePath = getLegacySelectedProjectFilePath();
  if (!existsSync(filePath)) {
    return;
  }

  let legacyProjectId: string | undefined;
  try {
    const raw = readFileSync(filePath, "utf-8");
    legacyProjectId = (JSON.parse(raw) as { projectId?: string }).projectId;
  } catch {
    // Corrupt/unreadable legacy file — discard it and move on.
    removeLegacyFile(filePath);
    return;
  }

  try {
    if (legacyProjectId) {
      const client = buildClient(apiToken, logger, appInfo);
      // Check the *stored* default only (`includeAutoPick: false`): the backend
      // would otherwise transiently auto-pick the sole accessible project, which
      // we'd mistake for a real stored default — skip the migration, delete the
      // file, and silently lose the user's selection once they gain a second
      // project. A stored default (set on another machine / web) still takes
      // precedence and is preserved.
      const { projectId: storedDefault } = await getOAuthDefaultProject(
        client,
        {
          includeAutoPick: false,
        },
      );
      if (!storedDefault) {
        await setOAuthDefaultProject(client, legacyProjectId);
        logger.debug(
          `Migrated local default project ${legacyProjectId} to your Meticulous account settings.`,
        );
      }
    }
  } catch {
    // Leave the file in place so a later invocation can retry.
    return;
  }

  removeLegacyFile(filePath);
};

const removeLegacyFile = (filePath: string): void => {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors.
  }
};
