import { PUPPETEER_REVISIONS } from "puppeteer-core/lib/puppeteer/revisions.js";
import { describe, expect, it } from "vitest";
import { CHROME_BUILD_ID } from "../chrome-build-id";

describe("CHROME_BUILD_ID", () => {
  it("matches the Chrome build pinned by the workspace's puppeteer-core", () => {
    expect(CHROME_BUILD_ID).toBe(PUPPETEER_REVISIONS.chrome);
  });
});
