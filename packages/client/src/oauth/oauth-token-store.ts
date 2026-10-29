import { randomBytes } from "crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
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

// Resolved lazily (not at module load) so it honours `METICULOUS_DIR` / a
// `--dataDir` override set after import — matching every other consumer of
// `getMeticulousLocalDataDir`.
const getMeticulousDir = (): string => getMeticulousLocalDataDir();
const getTokenFilePath = (): string =>
  join(getMeticulousDir(), "oauth-tokens.json");

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

// Written to a temp file and renamed into place, so a concurrent reader (e.g. a
// parallel CLI process refreshing at the same time) never sees a half-written
// file and mistakes it for a missing login.
export const storeOAuthTokens = (tokens: StoredOAuthTokens): void => {
  if (!existsSync(getMeticulousDir())) {
    mkdirSync(getMeticulousDir(), { recursive: true });
  }
  const tempPath = `${getTokenFilePath()}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    writeFileSync(tempPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    renameSync(tempPath, getTokenFilePath());
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
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
