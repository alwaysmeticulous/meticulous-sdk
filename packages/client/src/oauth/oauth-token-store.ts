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
  /**
   * The id of the project the user has selected via `auth set-project`.
   * Used by project-scoped CLI commands that authenticate with an OAuth
   * token (which by itself does not pin a project).
   */
  projectId?: string | undefined;
  /**
   * Human-readable "<organization-name>/<project-name>" slug for the
   * selected project. Stored alongside `projectId` so it can be displayed
   * (e.g. by `auth whoami`) without an extra API round-trip.
   */
  project?: string | undefined;
}

const METICULOUS_DIR = join(homedir(), ".meticulous");
const TOKEN_FILE_PATH = join(METICULOUS_DIR, "oauth-tokens.json");

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

export const getStoredProjectId = (): string | null => {
  return getStoredOAuthTokens()?.projectId ?? null;
};

export const getStoredProject = (): string | null => {
  return getStoredOAuthTokens()?.project ?? null;
};

export const setStoredProject = ({
  project,
  projectId,
}: {
  project: string;
  projectId: string;
}): void => {
  const existing = getStoredOAuthTokens();
  if (!existing) {
    throw new Error(
      "No stored OAuth tokens found. Run `meticulous auth login` (or any " +
        "command that triggers OAuth login) before selecting a project.",
    );
  }
  storeOAuthTokens({ ...existing, project, projectId });
};

export const clearStoredProject = (): void => {
  const existing = getStoredOAuthTokens();
  if (!existing) {
    return;
  }
  storeOAuthTokens({
    accessToken: existing.accessToken,
    refreshToken: existing.refreshToken,
    expiresAt: existing.expiresAt,
    ...(existing.idToken ? { idToken: existing.idToken } : {}),
  });
};
