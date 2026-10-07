import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureBrowser } from "../browser-installer";

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

vi.mock("puppeteer-core/lib/puppeteer/revisions.js", () => ({
  PUPPETEER_REVISIONS: { chrome: "152.0.7977.42" },
}));

describe("ensureBrowser", () => {
  const originalEnv = process.env;
  let tempDir: string;
  let chromeBinary: string;

  beforeEach(() => {
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
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns PUPPETEER_EXECUTABLE_PATH when the binary exists, without installing", async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = chromeBinary;
    detectBrowserPlatformMock.mockReturnValue("linux");

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

    await expect(ensureBrowser()).rejects.toThrow(
      /PUPPETEER_EXECUTABLE_PATH is set to .*missing-chrome but no file exists there/,
    );
    expect(installMock).not.toHaveBeenCalled();
  });

  it("reuses an installed browser matching the puppeteer-core recommended revision", async () => {
    process.env.PUPPETEER_CACHE_DIR = tempDir;
    detectBrowserPlatformMock.mockReturnValue("linux");
    getInstalledBrowsersMock.mockResolvedValue([
      {
        browser: "chrome",
        platform: "linux",
        buildId: "152.0.7977.42",
        executablePath: chromeBinary,
      },
    ]);

    const result = await ensureBrowser();

    expect(result).toBe(chromeBinary);
    expect(installMock).not.toHaveBeenCalled();
  });

  it("installs the puppeteer-core recommended Chrome revision", async () => {
    process.env.PUPPETEER_CACHE_DIR = tempDir;
    detectBrowserPlatformMock.mockReturnValue("linux");
    getInstalledBrowsersMock.mockResolvedValue([
      {
        browser: "chrome",
        platform: "linux",
        buildId: "148.0.7778.97",
        executablePath: chromeBinary,
      },
    ]);
    installMock.mockResolvedValue({ executablePath: chromeBinary });

    const result = await ensureBrowser();

    expect(result).toBe(chromeBinary);
    expect(installMock).toHaveBeenCalledWith(
      expect.objectContaining({ buildId: "152.0.7977.42", cacheDir: tempDir }),
    );
  });

  it("prefers METICULOUS_CHROME_BUILD_ID over puppeteer-core's recommended revision", async () => {
    process.env.PUPPETEER_CACHE_DIR = tempDir;
    process.env.METICULOUS_CHROME_BUILD_ID = "153.0.8001.0";
    detectBrowserPlatformMock.mockReturnValue("linux");
    getInstalledBrowsersMock.mockResolvedValue([]);
    installMock.mockResolvedValue({ executablePath: chromeBinary });

    const result = await ensureBrowser();

    expect(result).toBe(chromeBinary);
    expect(installMock).toHaveBeenCalledWith(
      expect.objectContaining({ buildId: "153.0.8001.0" }),
    );
  });

  it("warns once about an invalid PUPPETEER_CACHE_DIR when installing", async () => {
    process.env.PUPPETEER_CACHE_DIR = "relative/cache";
    detectBrowserPlatformMock.mockReturnValue("linux");
    getInstalledBrowsersMock.mockResolvedValue([]);
    installMock.mockResolvedValue({ executablePath: chromeBinary });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await ensureBrowser();

    expect(warn).toHaveBeenCalledOnce();
    expect(installMock).toHaveBeenCalledOnce();
  });
});
