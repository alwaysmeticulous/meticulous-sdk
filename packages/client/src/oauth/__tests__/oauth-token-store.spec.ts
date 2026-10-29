import { mkdtempSync, readdirSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type * as Common from "@alwaysmeticulous/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStoredOAuthTokens, storeOAuthTokens } from "../oauth-token-store";

// Point the store at a temp dir so tests never touch the real
// ~/.meticulous/oauth-tokens.json.
const dataDir = vi.hoisted(() => ({ path: "" }));

vi.mock("@alwaysmeticulous/common", async (importOriginal) => ({
  ...(await importOriginal<typeof Common>()),
  getMeticulousLocalDataDir: () => dataDir.path,
}));

const tokens = (refreshToken: string) => ({
  accessToken: "access",
  refreshToken,
  expiresAt: 1_000,
});

describe("storeOAuthTokens", () => {
  beforeEach(() => {
    dataDir.path = join(
      mkdtempSync(join(tmpdir(), "oauth-token-store-")),
      "nested",
    );
  });

  afterEach(() => {
    rmSync(join(dataDir.path, ".."), { recursive: true, force: true });
  });

  it("creates the directory and writes an owner-only token file", () => {
    storeOAuthTokens(tokens("refresh-1"));

    expect(getStoredOAuthTokens()).toEqual(tokens("refresh-1"));
    const mode = statSync(join(dataDir.path, "oauth-tokens.json")).mode;
    if (process.platform !== "win32") {
      expect(mode & 0o777).toBe(0o600);
    }
  });

  it("replaces an existing login without leaving temp files behind", () => {
    storeOAuthTokens(tokens("refresh-1"));
    storeOAuthTokens(tokens("refresh-2"));

    expect(getStoredOAuthTokens()).toEqual(tokens("refresh-2"));
    expect(readdirSync(dataDir.path)).toEqual(["oauth-tokens.json"]);
  });
});
