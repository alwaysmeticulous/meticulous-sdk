import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { InstallOptions, InstalledBrowser } from "@puppeteer/browsers";
import {
  install,
  Browser,
  detectBrowserPlatform,
  resolveBuildId,
  getInstalledBrowsers,
} from "@puppeteer/browsers";
import chalk from "chalk";

/**
 * Loads the puppeteer-core revisions, aka recommended browser versions
 */
async function loadPuppeteerRevisions(): Promise<
  { chrome: string } | undefined
> {
  try {
    const revisions =
      await import("puppeteer-core/lib/cjs/puppeteer/revisions.js");
    return revisions.PUPPETEER_REVISIONS;
  } catch {
    try {
      const revisions =
        await import("puppeteer-core/lib/esm/puppeteer/revisions.js");
      return revisions.PUPPETEER_REVISIONS;
    } catch {
      return undefined;
    }
  }
}

const INSTALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_INSTALL_RETRIES = 3;

/**
 * Optional explicit Chrome-for-Testing build id (e.g. "153.0.8001.0") that
 * overrides the version puppeteer-core recommends. Used to bake a different
 * Chrome into a purpose-built replay image (e.g. the arm64 worker, whose
 * Chrome for Testing arm64 binary first shipped in 153) without moving the
 * repo-wide puppeteer-core pin. Unset everywhere else, so the puppeteer-core
 * pin remains the source of truth.
 */
function getOverrideChromeBuildId(): string | undefined {
  const override = process.env.METICULOUS_CHROME_BUILD_ID?.trim();
  return override ? override : undefined;
}

/**
 * Validates and sanitizes cache directory path
 */
function validateCacheDir(cacheDir: string | undefined): string | undefined {
  if (!cacheDir) return undefined;

  // Security: Validate path to prevent directory traversal
  if (!path.isAbsolute(cacheDir)) {
    console.warn(
      chalk.yellow("PUPPETEER_CACHE_DIR must be an absolute path, ignoring"),
    );
    return undefined;
  }

  if (cacheDir.includes("..")) {
    console.warn(
      chalk.yellow(
        "PUPPETEER_CACHE_DIR contains '..' which is not allowed, ignoring",
      ),
    );
    return undefined;
  }

  return cacheDir;
}

/**
 * Attempts to install browser with retry logic
 */
async function installBrowserWithRetry(
  options: InstallOptions,
  maxRetries: number = MAX_INSTALL_RETRIES,
): Promise<InstalledBrowser> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `Browser installation timed out after ${INSTALL_TIMEOUT_MS / 1000} seconds`,
              ),
            ),
          INSTALL_TIMEOUT_MS,
        );
      });

      // Race between installation and timeout
      // Explicitly type the install call to use the unpack=true overload
      const result = await Promise.race([
        install({ ...options, unpack: true }),
        timeoutPromise,
      ]);

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const retryDelay = 1000 * attempt;
        console.log(
          chalk.yellow(
            `Installation attempt ${attempt} failed: ${lastError.message}`,
          ),
        );
        console.log(
          chalk.gray(
            `Retrying in ${retryDelay / 1000} seconds... (attempt ${attempt + 1}/${maxRetries})`,
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw lastError || new Error("Browser installation failed after all retries");
}

/**
 * When set, use this pre-installed Chrome executable instead of downloading via
 * `@puppeteer/browsers`. Used by the arm64 replay-cloud-worker image, which
 * bakes a linux-arm64 Chrome for Testing build directly because our pinned
 * `@puppeteer/browsers` still resolves linux_arm to the x86-64 linux64 zip.
 */
const getExplicitExecutablePath = (): string | undefined => {
  const explicit = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  return explicit ? explicit : undefined;
};

/**
 * Ensures browser is available using Puppeteer's built-in browser installer
 * @param browserType The type of browser to install (default: Chrome)
 * @returns Path to the browser executable
 * @throws Error if browser cannot be installed or found
 */
export async function ensureBrowser(
  browserType: Browser = Browser.CHROME,
): Promise<string> {
  // Prefer an explicitly configured executable (e.g. the arm64 worker's
  // directly-downloaded Chrome for Testing). Must come before any cache lookup
  // or install attempt — cloud replay pods have a read-only root filesystem, so
  // falling through to install() fails with ENOENT/EROFS on the cache dir.
  const explicitExecutable = getExplicitExecutablePath();
  if (explicitExecutable) {
    if (!fs.existsSync(explicitExecutable)) {
      throw new Error(
        `PUPPETEER_EXECUTABLE_PATH is set to ${explicitExecutable} but no file ` +
          "exists there. Ensure the browser package is installed, or unset the " +
          "variable to allow automatic installation.",
      );
    }
    if (!process.env.METICULOUS_IS_CLOUD_REPLAY) {
      console.log(
        chalk.gray(
          `Using browser from PUPPETEER_EXECUTABLE_PATH: ${explicitExecutable}`,
        ),
      );
    }
    return explicitExecutable;
  }

  const platform = detectBrowserPlatform();
  if (platform) {
    const validatedCacheDir = validateCacheDir(process.env.PUPPETEER_CACHE_DIR);
    const cacheDir =
      validatedCacheDir || path.join(os.homedir(), ".cache", "puppeteer");

    // Get the expected Chrome version: an explicit METICULOUS_CHROME_BUILD_ID
    // override wins, else the version puppeteer-core recommends, else (later)
    // the latest stable version.
    const revisions = await loadPuppeteerRevisions();
    const expectedVersion = getOverrideChromeBuildId() ?? revisions?.chrome;

    try {
      const installedBrowsers = await getInstalledBrowsers({ cacheDir });
      const matchingBrowser = installedBrowsers.find(
        (browser) =>
          browser.browser === browserType &&
          browser.platform === platform &&
          (!expectedVersion || browser.buildId === expectedVersion),
      );

      if (matchingBrowser && fs.existsSync(matchingBrowser.executablePath)) {
        if (!process.env.METICULOUS_IS_CLOUD_REPLAY) {
          if (expectedVersion) {
            console.log(
              chalk.gray(
                `Found existing browser with expected version ${expectedVersion}: ${matchingBrowser.executablePath}`,
              ),
            );
          } else {
            console.log(
              chalk.gray(
                `Found existing browser: ${matchingBrowser.executablePath}`,
              ),
            );
          }
        }
        return matchingBrowser.executablePath;
      } else if (expectedVersion && installedBrowsers.length > 0) {
        const mismatchedBrowser = installedBrowsers.find(
          (browser) =>
            browser.browser === browserType && browser.platform === platform,
        );
        if (mismatchedBrowser) {
          console.log(
            chalk.yellow(
              `Found cached browser (${mismatchedBrowser.buildId}) but puppeteer-core expects ${expectedVersion}. Will install correct version.`,
            ),
          );
        }
      }
    } catch (error) {
      console.debug(chalk.gray(`Could not check installed browsers: ${error}`));
    }
  }

  if (!platform) {
    throw new Error(
      "Unsupported platform for automatic browser installation.\n" +
        "Please install Chrome manually:\n" +
        chalk.blue("• macOS:") +
        " brew install --cask google-chrome\n" +
        chalk.blue("• Ubuntu:") +
        " sudo apt-get install google-chrome-stable\n" +
        chalk.blue("• Windows:") +
        " Download from https://www.google.com/chrome/",
    );
  }

  const validatedCacheDir = validateCacheDir(process.env.PUPPETEER_CACHE_DIR);
  const cacheDir =
    validatedCacheDir || path.join(os.homedir(), ".cache", "puppeteer");

  // `@puppeteer/browsers` mkdir's `<cacheDir>/chrome` during install; if the
  // cache root itself is missing that can surface as ENOENT (see #6091). Create
  // it up front so installs are resilient in fresh environments.
  fs.mkdirSync(cacheDir, { recursive: true });

  let buildId: string;
  const revisions = await loadPuppeteerRevisions();
  const overrideBuildId = getOverrideChromeBuildId();
  const expectedVersion = overrideBuildId ?? revisions?.chrome;

  if (expectedVersion) {
    console.log(
      chalk.gray(
        overrideBuildId
          ? `Using Chrome version from METICULOUS_CHROME_BUILD_ID: ${expectedVersion}`
          : `Using Chrome version from puppeteer-core: ${expectedVersion}`,
      ),
    );
    buildId = expectedVersion;
  } else {
    console.log(chalk.gray("Falling back to latest stable Chrome version"));
    buildId = await resolveBuildId(browserType, platform, "stable");
  }
  const baseOptions = {
    browser: browserType,
    platform,
    buildId,
  };
  const installOptions: InstallOptions = { ...baseOptions, cacheDir };

  console.log(
    chalk.yellow("Browser not found. Installing Chrome for Meticulous..."),
  );
  console.log(chalk.gray("This is a one-time setup (~200MB download)."));

  try {
    const installedBrowser = await installBrowserWithRetry(installOptions);
    console.log(chalk.green("✓ Browser installed successfully!"));
    return installedBrowser.executablePath;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCause = error instanceof Error ? error : undefined;

    const troubleshootingMessage =
      `Failed to install browser: ${errorMessage}\n\n` +
      "Troubleshooting steps:\n" +
      "1. Check your internet connection\n" +
      "2. Ensure you have sufficient disk space (~300MB)\n" +
      "3. Try setting a custom cache directory: export PUPPETEER_CACHE_DIR=/path/to/cache\n" +
      "4. Install Chrome manually and set: export PUPPETEER_EXECUTABLE_PATH=/path/to/chrome\n\n" +
      "For more help, see: https://pptr.dev/troubleshooting";

    // Node 16+ supports Error cause, but we need to handle older versions
    const err = new Error(troubleshootingMessage);
    if (errorCause && "cause" in err) {
      (err as any).cause = errorCause;
    }
    throw err;
  }
}
