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
