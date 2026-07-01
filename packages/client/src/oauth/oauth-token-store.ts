import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { getMeticulousLocalDataDir } from "@alwaysmeticulous/common";

export interface StoredOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix seconds
  idToken?: string | undefined;
}

interface StoredSelectedProject {
  /**
   * The id of the project the user has selected via `auth set-project`.
   * Used by project-scoped CLI commands that authenticate with an OAuth
   * token (which by itself does not pin a project).
   */
  projectId: string;
  /**
   * Human-readable "<organization-name>/<project-name>" slug for the
   * selected project. Stored alongside `projectId` so it can be displayed
   * (e.g. by `auth whoami`) without an extra API round-trip.
   */
  project: string;
}

// Resolved lazily (not at module load) so it honours `METICULOUS_DIR` / a
// `--dataDir` override set after import — matching every other consumer of
// `getMeticulousLocalDataDir`.
const getMeticulousDir = (): string => getMeticulousLocalDataDir();
const getTokenFilePath = (): string =>
  join(getMeticulousDir(), "oauth-tokens.json");
const getSelectedProjectFilePath = (): string =>
  join(getMeticulousDir(), "selected-project.json");

export const getStoredOAuthTokens = (): StoredOAuthTokens | null => {
  try {
    if (!existsSync(getTokenFilePath())) {
      return null;
    }
    const data = readFileSync(getTokenFilePath(), "utf-8");
    return JSON.parse(data) as StoredOAuthTokens;
  } catch {
    return null;
  }
};

export const storeOAuthTokens = (tokens: StoredOAuthTokens): void => {
  if (!existsSync(getMeticulousDir())) {
    mkdirSync(getMeticulousDir(), { recursive: true });
  }
  writeFileSync(getTokenFilePath(), JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });
};

export const clearOAuthTokens = (): void => {
  try {
    if (existsSync(getTokenFilePath())) {
      unlinkSync(getTokenFilePath());
    }
  } catch {
    // Ignore errors during cleanup
  }
};

const getStoredSelectedProject = (): StoredSelectedProject | null => {
  try {
    if (!existsSync(getSelectedProjectFilePath())) {
      return null;
    }
    const data = readFileSync(getSelectedProjectFilePath(), "utf-8");
    return JSON.parse(data) as StoredSelectedProject;
  } catch {
    return null;
  }
};

export const getStoredProjectId = (): string | null => {
  return getStoredSelectedProject()?.projectId ?? null;
};

export const getStoredProject = (): string | null => {
  return getStoredSelectedProject()?.project ?? null;
};

export const setStoredProject = ({
  project,
  projectId,
}: {
  project: string;
  projectId: string;
}): void => {
  if (!existsSync(getMeticulousDir())) {
    mkdirSync(getMeticulousDir(), { recursive: true });
  }
  writeFileSync(
    getSelectedProjectFilePath(),
    JSON.stringify({ project, projectId }, null, 2),
    { mode: 0o600 },
  );
};

export const clearStoredProject = (): void => {
  try {
    if (existsSync(getSelectedProjectFilePath())) {
      unlinkSync(getSelectedProjectFilePath());
    }
  } catch {
    // Ignore errors during cleanup
  }
};
