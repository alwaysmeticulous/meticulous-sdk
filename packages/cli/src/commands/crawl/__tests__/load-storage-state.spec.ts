import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  loadStorageState,
  parseStorageState,
  StorageStateError,
} from "../load-storage-state";

const START_URL = "http://localhost:3000/dashboard";

describe("parseStorageState", () => {
  it("converts a Playwright storage state, keeping only the first start URL's local storage", () => {
    const result = parseStorageState(
      {
        cookies: [
          {
            name: "session",
            value: "abc",
            domain: "localhost",
            path: "/",
            expires: 1_900_000_000,
            httpOnly: true,
            secure: false,
            sameSite: "Lax",
          },
          {
            name: "transient",
            value: "1",
            domain: "localhost",
            path: "/",
            expires: -1,
            httpOnly: false,
            secure: false,
            sameSite: "None",
          },
        ],
        origins: [
          {
            origin: "http://localhost:3000",
            localStorage: [{ name: "token", value: "xyz" }],
          },
          {
            origin: "http://localhost:4000",
            localStorage: [{ name: "other", value: "ignored" }],
          },
        ],
      },
      START_URL,
    );

    expect(result).toEqual({
      cookies: [
        {
          name: "session",
          value: "abc",
          domain: "localhost",
          path: "/",
          expires: 1_900_000_000_000,
          httpOnly: true,
          secure: false,
          sameSite: "lax",
        },
        {
          name: "transient",
          value: "1",
          domain: "localhost",
          path: "/",
          expires: null,
          httpOnly: false,
          secure: false,
          sameSite: "none",
        },
      ],
      localStorageEntries: [{ key: "token", value: "xyz" }],
      sessionStorageEntries: [],
    });
  });

  it("accepts a bare array of Puppeteer cookies", () => {
    const result = parseStorageState(
      [
        {
          name: "sid",
          value: "1",
          domain: "localhost",
          path: "/",
          expires: -1,
          size: 4,
          session: true,
        },
      ],
      START_URL,
    );

    expect(result).toEqual({
      cookies: [
        {
          name: "sid",
          value: "1",
          domain: "localhost",
          path: "/",
          expires: null,
        },
      ],
      localStorageEntries: [],
      sessionStorageEntries: [],
    });
  });

  it("accepts a storage state without origins", () => {
    expect(
      parseStorageState({ cookies: [] }, START_URL).localStorageEntries,
    ).toEqual([]);
  });

  it.each([
    ["a string", "cookies"],
    ["an object without cookies", { origins: [] }],
    ["a cookie without a value", [{ name: "x" }]],
    [
      "non-string local storage",
      {
        cookies: [],
        origins: [
          {
            origin: "http://localhost:3000",
            localStorage: [{ name: "x", value: 1 }],
          },
        ],
      },
    ],
  ])("rejects %s", (_, input) => {
    expect(() => parseStorageState(input, START_URL)).toThrow(
      StorageStateError,
    );
  });
});

describe("loadStorageState", () => {
  it("reads and parses the file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crawl-storage-state-"));
    const path = join(dir, "state.json");
    await writeFile(path, JSON.stringify({ cookies: [], origins: [] }));

    await expect(loadStorageState(path, START_URL)).resolves.toEqual({
      cookies: [],
      localStorageEntries: [],
      sessionStorageEntries: [],
    });
  });

  it("reports a missing file or invalid JSON as a StorageStateError", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crawl-storage-state-"));
    const invalidPath = join(dir, "invalid.json");
    await writeFile(invalidPath, "{not json");

    await expect(
      loadStorageState(join(dir, "missing.json"), START_URL),
    ).rejects.toThrow(StorageStateError);
    await expect(loadStorageState(invalidPath, START_URL)).rejects.toThrow(
      /not valid JSON/,
    );
  });
});
