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
