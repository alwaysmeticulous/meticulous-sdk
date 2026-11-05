import { readFile } from "fs/promises";
import type { Cookie, StorageEntry } from "@alwaysmeticulous/api";
import type { CrawlStorageToSeed } from "@alwaysmeticulous/sdk-bundles-api";

export class StorageStateError extends Error {}

/**
 * Reads cookies and local storage to seed into the crawler's browser from either:
 *
 * - a Playwright storage state (`context.storageState({ path })`): `{ cookies, origins }`, or
 * - a bare array of Puppeteer / Chrome DevTools cookies, as written by `page.cookies()` or
 *   to `cookies/cookies.json` in the Meticulous data dir by `meticulous record session --incognito=false`.
 *
 * Only the local storage of the first start URL's origin is kept, since the crawler only
 * exposes seeded storage to that origin.
 */
export const loadStorageState = async (
  path: string,
  firstStartUrl: string,
): Promise<CrawlStorageToSeed> => {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw new StorageStateError(
      `Could not read --storageState file '${path}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StorageStateError(
      `--storageState file '${path}' is not valid JSON.`,
    );
  }
  return parseStorageState(parsed, firstStartUrl);
};

export const parseStorageState = (
  parsed: unknown,
  firstStartUrl: string,
): CrawlStorageToSeed => {
  if (Array.isArray(parsed)) {
    return {
      cookies: parsed.map(toMeticulousCookie),
      localStorageEntries: [],
      sessionStorageEntries: [],
    };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed["cookies"])) {
    throw new StorageStateError(
      "--storageState must be a Playwright storage state ({ cookies, origins }) or an array of cookies.",
    );
  }
  const origins = parsed["origins"] ?? [];
  if (!Array.isArray(origins)) {
    throw new StorageStateError(
      "--storageState 'origins' must be an array of { origin, localStorage }.",
    );
  }
  return {
    cookies: parsed["cookies"].map(toMeticulousCookie),
    localStorageEntries: getLocalStorageForOrigin(
      origins,
      new URL(firstStartUrl).origin,
    ),
    sessionStorageEntries: [],
  };
};

const getLocalStorageForOrigin = (
  origins: unknown[],
  origin: string,
): StorageEntry[] =>
  origins
    .filter(
      (entry): entry is Record<string, unknown> =>
        isRecord(entry) && entry["origin"] === origin,
    )
    .flatMap((entry) => {
      const localStorage = entry["localStorage"] ?? [];
      if (!Array.isArray(localStorage)) {
        throw new StorageStateError(
          `--storageState localStorage for ${origin} must be an array of { name, value }.`,
        );
      }
      return localStorage.map((item) => {
        if (
          !isRecord(item) ||
          typeof item["name"] !== "string" ||
          typeof item["value"] !== "string"
        ) {
          throw new StorageStateError(
            `--storageState localStorage entries for ${origin} must be { name, value } strings.`,
          );
        }
        return { key: item["name"], value: item["value"] };
      });
    });

const toMeticulousCookie = (cookie: unknown): Cookie => {
  if (
    !isRecord(cookie) ||
    typeof cookie["name"] !== "string" ||
    typeof cookie["value"] !== "string"
  ) {
    throw new StorageStateError(
      "Every --storageState cookie must have a string 'name' and 'value'.",
    );
  }
  const { name, value, domain, path, expires, httpOnly, secure, sameSite } =
    cookie;
  const convertedSameSite = convertSameSite(sameSite);
  return {
    name,
    value,
    domain: typeof domain === "string" && domain !== "" ? domain : null,
    // Playwright and Puppeteer use seconds since epoch, with -1 for session cookies.
    expires: typeof expires === "number" && expires > 0 ? expires * 1000 : null,
    ...(typeof path === "string" ? { path } : {}),
    ...(typeof httpOnly === "boolean" ? { httpOnly } : {}),
    ...(typeof secure === "boolean" ? { secure } : {}),
    ...(convertedSameSite ? { sameSite: convertedSameSite } : {}),
  };
};

const convertSameSite = (sameSite: unknown): Cookie["sameSite"] => {
  if (typeof sameSite !== "string") {
    return undefined;
  }
  switch (sameSite.toLowerCase()) {
    case "strict":
      return "strict";
    case "lax":
      return "lax";
    case "none":
      return "none";
    default:
      return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
