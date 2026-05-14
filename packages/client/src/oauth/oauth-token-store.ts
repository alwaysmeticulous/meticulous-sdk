import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";

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

const METICULOUS_DIR = join(homedir(), ".meticulous");
const TOKEN_FILE_PATH = join(METICULOUS_DIR, "oauth-tokens.json");
const SELECTED_PROJECT_FILE_PATH = join(
  METICULOUS_DIR,
  "selected-project.json",
);

export const getStoredOAuthTokens = (): StoredOAuthTokens | null => {
  try {
    if (!existsSync(TOKEN_FILE_PATH)) {
      return null;
    }
    const data = readFileSync(TOKEN_FILE_PATH, "utf-8");
    return JSON.parse(data) as StoredOAuthTokens;
  } catch {
    return null;
  }
};

export const storeOAuthTokens = (tokens: StoredOAuthTokens): void => {
  if (!existsSync(METICULOUS_DIR)) {
    mkdirSync(METICULOUS_DIR, { recursive: true });
  }
  writeFileSync(TOKEN_FILE_PATH, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });
};

export const clearOAuthTokens = (): void => {
  try {
    if (existsSync(TOKEN_FILE_PATH)) {
      unlinkSync(TOKEN_FILE_PATH);
    }
  } catch {
    // Ignore errors during cleanup
  }
};

const getStoredSelectedProject = (): StoredSelectedProject | null => {
  try {
    if (!existsSync(SELECTED_PROJECT_FILE_PATH)) {
      return null;
    }
    const data = readFileSync(SELECTED_PROJECT_FILE_PATH, "utf-8");
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
  if (!existsSync(METICULOUS_DIR)) {
    mkdirSync(METICULOUS_DIR, { recursive: true });
  }
  writeFileSync(
    SELECTED_PROJECT_FILE_PATH,
    JSON.stringify({ project, projectId }, null, 2),
    { mode: 0o600 },
  );
};

export const clearStoredProject = (): void => {
  try {
    if (existsSync(SELECTED_PROJECT_FILE_PATH)) {
      unlinkSync(SELECTED_PROJECT_FILE_PATH);
    }
  } catch {
    // Ignore errors during cleanup
  }
};
