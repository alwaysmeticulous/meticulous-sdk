import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { installMock, getInstalledBrowsersMock, detectBrowserPlatformMock } =
  vi.hoisted(() => ({
    installMock: vi.fn(),
    getInstalledBrowsersMock: vi.fn(),
    detectBrowserPlatformMock: vi.fn(),
  }));

vi.mock("@puppeteer/browsers", () => ({
  Browser: { CHROME: "chrome" },
  install: installMock,
  getInstalledBrowsers: getInstalledBrowsersMock,
  detectBrowserPlatform: detectBrowserPlatformMock,
}));

const NEW_REVISIONS_SPECIFIER = "puppeteer-core/lib/puppeteer/revisions.js";
const LEGACY_CJS_REVISIONS_SPECIFIER =
  "puppeteer-core/lib/cjs/puppeteer/revisions.js";
const LEGACY_ESM_REVISIONS_SPECIFIER =
  "puppeteer-core/lib/esm/puppeteer/revisions.js";

/**
 * Simulates puppeteer-core's revision-export layout: >=25 exposes a single
 * path, <25 only the two build-specific deep imports. `chrome: undefined`
 * emulates that specifier not existing in the "installed" major (a rejected
 * dynamic import), matching what `loadPuppeteerRevisions` actually catches.
 */
const mockRevisionsLayout = (specifier: string, chrome: string | undefined) =>
  vi.doMock(specifier, () => {
    if (chrome === undefined) {
      throw new Error(`Cannot find module '${specifier}'`);
    }
    return { PUPPETEER_REVISIONS: { chrome } };
  });

const mockUnresolvableRevisions = () => {
  mockRevisionsLayout(NEW_REVISIONS_SPECIFIER, undefined);
  mockRevisionsLayout(LEGACY_CJS_REVISIONS_SPECIFIER, undefined);
  mockRevisionsLayout(LEGACY_ESM_REVISIONS_SPECIFIER, undefined);
};

describe("ensureBrowser", () => {
  const originalEnv = process.env;
  let tempDir: string;
  let chromeBinary: string;

  beforeEach(() => {
    vi.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ensure-browser-"));
    chromeBinary = path.join(tempDir, "chrome");
    fs.writeFileSync(chromeBinary, "");
    process.env = { ...originalEnv };
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    delete process.env.PUPPETEER_CACHE_DIR;
    delete process.env.METICULOUS_CHROME_BUILD_ID;
    delete process.env.METICULOUS_IS_CLOUD_REPLAY;
    installMock.mockReset();
    getInstalledBrowsersMock.mockReset();
    detectBrowserPlatformMock.mockReset();
    mockUnresolvableRevisions();
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns PUPPETEER_EXECUTABLE_PATH when the binary exists, without installing", async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = chromeBinary;
    detectBrowserPlatformMock.mockReturnValue("linux");

    const { ensureBrowser } = await import("../src/browser-installer");
    const result = await ensureBrowser();

    expect(result).toBe(chromeBinary);
    expect(installMock).not.toHaveBeenCalled();
    expect(getInstalledBrowsersMock).not.toHaveBeenCalled();
  });

  it("throws when PUPPETEER_EXECUTABLE_PATH is set but the file is missing", async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = path.join(
      tempDir,
      "missing-chrome",
    );

    const { ensureBrowser } = await import("../src/browser-installer");

    await expect(ensureBrowser()).rejects.toThrow(
      /PUPPETEER_EXECUTABLE_PATH is set to .*missing-chrome but no file exists there/,
    );
    expect(installMock).not.toHaveBeenCalled();
  });

  it("installs the puppeteer-core >=25 recommended Chrome revision", async () => {
    process.env.PUPPETEER_CACHE_DIR = tempDir;
    detectBrowserPlatformMock.mockReturnValue("linux");
    getInstalledBrowsersMock.mockResolvedValue([]);
    installMock.mockResolvedValue({ executablePath: chromeBinary });
    mockRevisionsLayout(NEW_REVISIONS_SPECIFIER, "152.0.7977.42");

    const { ensureBrowser } = await import("../src/browser-installer");
    const result = await ensureBrowser();

    expect(result).toBe(chromeBinary);
    expect(installMock).toHaveBeenCalledWith(
      expect.objectContaining({ buildId: "152.0.7977.42" }),
    );
  });

  it("falls back to the legacy <25 revisions layout when the new path can't be resolved", async () => {
    process.env.PUPPETEER_CACHE_DIR = tempDir;
    detectBrowserPlatformMock.mockReturnValue("linux");
    getInstalledBrowsersMock.mockResolvedValue([]);
    installMock.mockResolvedValue({ executablePath: chromeBinary });
    mockRevisionsLayout(LEGACY_CJS_REVISIONS_SPECIFIER, "148.0.7778.97");

    const { ensureBrowser } = await import("../src/browser-installer");
    const result = await ensureBrowser();

    expect(result).toBe(chromeBinary);
    expect(installMock).toHaveBeenCalledWith(
      expect.objectContaining({ buildId: "148.0.7778.97" }),
    );
  });

  it("throws rather than installing an unpinned Chrome when no revision is resolvable", async () => {
    process.env.PUPPETEER_CACHE_DIR = tempDir;
    detectBrowserPlatformMock.mockReturnValue("linux");
    getInstalledBrowsersMock.mockResolvedValue([]);

    const { ensureBrowser } = await import("../src/browser-installer");

    await expect(ensureBrowser()).rejects.toThrow(
      /Could not determine which Chrome build to install/,
    );
    expect(installMock).not.toHaveBeenCalled();
  });

  it("prefers METICULOUS_CHROME_BUILD_ID over puppeteer-core's recommended revision", async () => {
    process.env.PUPPETEER_CACHE_DIR = tempDir;
    process.env.METICULOUS_CHROME_BUILD_ID = "153.0.8001.0";
    detectBrowserPlatformMock.mockReturnValue("linux");
    getInstalledBrowsersMock.mockResolvedValue([]);
    installMock.mockResolvedValue({ executablePath: chromeBinary });
    mockRevisionsLayout(NEW_REVISIONS_SPECIFIER, "152.0.7977.42");

    const { ensureBrowser } = await import("../src/browser-installer");
    const result = await ensureBrowser();

    expect(result).toBe(chromeBinary);
    expect(installMock).toHaveBeenCalledWith(
      expect.objectContaining({ buildId: "153.0.8001.0" }),
    );
  });
});
