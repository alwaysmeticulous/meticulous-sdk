import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  installMock,
  getInstalledBrowsersMock,
  detectBrowserPlatformMock,
  resolveBuildIdMock,
} = vi.hoisted(() => ({
  installMock: vi.fn(),
  getInstalledBrowsersMock: vi.fn(),
  detectBrowserPlatformMock: vi.fn(),
  resolveBuildIdMock: vi.fn(),
}));

vi.mock("@puppeteer/browsers", () => ({
  Browser: { CHROME: "chrome" },
  install: installMock,
  getInstalledBrowsers: getInstalledBrowsersMock,
  detectBrowserPlatform: detectBrowserPlatformMock,
  resolveBuildId: resolveBuildIdMock,
}));

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
    resolveBuildIdMock.mockReset();
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
});
