import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEBUG_DATA_DIRECTORY } from "../debug-constants";
import { extractScreenshotDomFiles } from "../extract-screenshot-dom-files";

describe("extractScreenshotDomFiles", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "met-debug-extract-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("is a no-op when the replays/ directory is missing", () => {
    expect(() => extractScreenshotDomFiles(workspace)).not.toThrow();
  });

  it("writes <name>.html and <name>.after.html when both DOMs are present", () => {
    const screenshotsDir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      "replay-1",
      "screenshots",
    );
    mkdirSync(screenshotsDir, { recursive: true });
    writeFileSync(
      join(screenshotsDir, "screenshot-after-event-00001.metadata.json"),
      JSON.stringify({
        before: {
          routeData: { url: "https://example.com/page" },
          dom: "<div>before</div>",
        },
        after: {
          dom: "<div>after</div>",
        },
      }),
    );

    extractScreenshotDomFiles(workspace);

    const beforePath = join(
      screenshotsDir,
      "screenshot-after-event-00001.html",
    );
    const afterPath = join(
      screenshotsDir,
      "screenshot-after-event-00001.after.html",
    );
    expect(existsSync(beforePath)).toBe(true);
    expect(existsSync(afterPath)).toBe(true);

    const beforeContent = readFileSync(beforePath, "utf-8");
    expect(beforeContent).toMatch(
      /^<!-- screenshot=screenshot-after-event-00001 side=before url=https:\/\/example\.com\/page( vt=\d+)? -->\n/,
    );
    expect(beforeContent).toContain("<div>before</div>");

    const afterContent = readFileSync(afterPath, "utf-8");
    expect(afterContent).toContain("side=after");
    expect(afterContent).toContain("<div>after</div>");
  });

  it("skips .after.html when metadata.after is null", () => {
    const screenshotsDir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      "replay-1",
      "screenshots",
    );
    mkdirSync(screenshotsDir, { recursive: true });
    writeFileSync(
      join(screenshotsDir, "final-state-v2.metadata.json"),
      JSON.stringify({ before: { dom: "<p>only before</p>" }, after: null }),
    );

    extractScreenshotDomFiles(workspace);

    expect(
      existsSync(join(screenshotsDir, "final-state-v2.html")),
    ).toBe(true);
    expect(
      existsSync(join(screenshotsDir, "final-state-v2.after.html")),
    ).toBe(false);
  });

  it("is idempotent (running twice yields identical contents)", () => {
    const screenshotsDir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "base",
      "replay-2",
      "screenshots",
    );
    mkdirSync(screenshotsDir, { recursive: true });
    writeFileSync(
      join(screenshotsDir, "screenshot-after-event-00002.redacted.metadata.json"),
      JSON.stringify({ before: { dom: "<div>x</div>" } }),
    );

    extractScreenshotDomFiles(workspace);
    const first = readFileSync(
      join(screenshotsDir, "screenshot-after-event-00002.redacted.html"),
      "utf-8",
    );
    extractScreenshotDomFiles(workspace);
    const second = readFileSync(
      join(screenshotsDir, "screenshot-after-event-00002.redacted.html"),
      "utf-8",
    );
    expect(second).toBe(first);
  });

  it("tolerates malformed metadata JSON without throwing", () => {
    const screenshotsDir = join(
      workspace,
      DEBUG_DATA_DIRECTORY,
      "replays",
      "head",
      "replay-1",
      "screenshots",
    );
    mkdirSync(screenshotsDir, { recursive: true });
    writeFileSync(
      join(screenshotsDir, "bad.metadata.json"),
      "not json at all",
    );

    expect(() => extractScreenshotDomFiles(workspace)).not.toThrow();
  });
});
