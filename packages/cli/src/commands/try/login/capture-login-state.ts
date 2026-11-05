import { ensureBrowser } from "@alwaysmeticulous/browser-installer";
import type { Browser, Cookie } from "puppeteer-core";
import { launch } from "puppeteer-core";

/** Playwright's storage-state format, which `meticulous crawl` and `record session` accept. */
export interface StorageState {
  cookies: StorageStateCookie[];
  origins: StorageStateOrigin[];
}

export interface StorageStateCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface StorageStateOrigin {
  origin: string;
  localStorage: { name: string; value: string }[];
}

export type LoginCaptureEnd = "closed" | "timeout";

const POLL_INTERVAL_MS = 1_000;

/**
 * Opens a fresh, visible browser at `url` for the user to log in, and returns the
 * cookies and local storage it holds when they close the window (or on timeout).
 * Local storage is polled while the pages are open, since it can't be read once the
 * user has closed them.
 */
export const captureLoginState = async (options: {
  url: string;
  timeoutMs: number;
}): Promise<{ state: StorageState; endedBy: LoginCaptureEnd }> => {
  const browser = await launch({
    executablePath: await ensureBrowser(),
    headless: false,
    defaultViewport: null,
    // Identity providers refuse to sign in to browsers that announce automation.
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    const [page] = await browser.pages();
    await (page ?? (await browser.newPage())).goto(options.url);
    return await pollUntilClosed(browser, options.timeoutMs);
  } finally {
    if (browser.connected) {
      await browser.close();
    }
  }
};

const pollUntilClosed = async (
  browser: Browser,
  timeoutMs: number,
): Promise<{ state: StorageState; endedBy: LoginCaptureEnd }> => {
  const deadline = Date.now() + timeoutMs;
  const localStorageByOrigin = new Map<string, StorageStateOrigin>();
  let cookies: Cookie[] = [];
  while (Date.now() < deadline) {
    const pages = browser.connected
      ? await browser.pages().catch(() => [])
      : [];
    if (pages.length === 0) {
      return {
        state: toState(cookies, localStorageByOrigin),
        endedBy: "closed",
      };
    }
    cookies = await browser
      .defaultBrowserContext()
      .cookies()
      .catch(() => cookies);
    for (const origin of await Promise.all(pages.map(readLocalStorage))) {
      if (origin) {
        localStorageByOrigin.set(origin.origin, origin);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return { state: toState(cookies, localStorageByOrigin), endedBy: "timeout" };
};

const readLocalStorage = async (
  page: Awaited<ReturnType<Browser["pages"]>>[number],
): Promise<StorageStateOrigin | null> => {
  const origin = await page
    .evaluate(() => ({
      origin: window.location.origin,
      localStorage: Object.entries(window.localStorage).map(
        ([name, value]) => ({ name, value }),
      ),
    }))
    // The page may be mid-navigation or already closed.
    .catch(() => null);
  return origin && origin.origin.startsWith("http") ? origin : null;
};

const toState = (
  cookies: Cookie[],
  localStorageByOrigin: Map<string, StorageStateOrigin>,
): StorageState => ({
  cookies: cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly ?? false,
    secure: cookie.secure,
    ...(cookie.sameSite && cookie.sameSite !== "Default"
      ? { sameSite: cookie.sameSite }
      : {}),
  })),
  origins: [...localStorageByOrigin.values()].filter(
    (origin) => origin.localStorage.length > 0,
  ),
});
