import type { Cookie } from "@alwaysmeticulous/api";
import type { RecordStorageToSeed } from "@alwaysmeticulous/record";
import type { CookieData, CookieSameSite } from "puppeteer-core";
import { CliUserError } from "../../utils/cli-user-error";
import {
  loadStorageState,
  StorageStateError,
} from "../crawl/load-storage-state";

export const loadRecordStorageState = async (
  path: string,
  appUrl: string,
): Promise<RecordStorageToSeed> => {
  try {
    const { cookies, localStorageEntries } = await loadStorageState(
      path,
      appUrl,
    );
    const appHostname = new URL(appUrl).hostname;
    return {
      cookies: cookies.map((cookie) => toPuppeteerCookie(cookie, appHostname)),
      localStorageEntries,
    };
  } catch (error) {
    if (error instanceof StorageStateError) {
      throw new CliUserError(error.message);
    }
    throw error;
  }
};

const toPuppeteerCookie = (
  cookie: Cookie,
  defaultDomain: string,
): CookieData => ({
  name: cookie.name,
  value: cookie.value,
  domain: cookie.domain ?? defaultDomain,
  ...(cookie.path != null ? { path: cookie.path } : {}),
  ...(cookie.expires != null ? { expires: cookie.expires / 1000 } : {}),
  ...(cookie.httpOnly != null ? { httpOnly: cookie.httpOnly } : {}),
  ...(cookie.secure != null ? { secure: cookie.secure } : {}),
  ...(cookie.sameSite
    ? { sameSite: toPuppeteerSameSite(cookie.sameSite) }
    : {}),
});

const toPuppeteerSameSite = (
  sameSite: NonNullable<Cookie["sameSite"]>,
): CookieSameSite => {
  switch (sameSite) {
    case "strict":
      return "Strict";
    case "lax":
      return "Lax";
    case "none":
      return "None";
  }
};
