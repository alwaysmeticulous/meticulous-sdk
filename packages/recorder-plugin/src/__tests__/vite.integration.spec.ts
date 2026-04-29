import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Options } from "../types";
import RecorderPlugin from "../vite";

let dir: string;

const writeIndexHtml = (body: string): void => {
  writeFileSync(join(dir, "index.html"), body);
};

const writeMainTs = (): void => {
  writeFileSync(join(dir, "main.ts"), 'console.log("hello");');
};

const STANDARD_INDEX_HTML =
  '<!doctype html><html><head><title>x</title></head><body><script type="module" src="/main.ts"></script></body></html>';

const runBuild = async (
  pluginOptions: Options,
  mode: "development" | "production",
): Promise<string> => {
  await build({
    root: dir,
    mode,
    configFile: false,
    logLevel: "silent",
    plugins: [RecorderPlugin(pluginOptions)],
    build: {
      write: true,
      outDir: "dist",
      emptyOutDir: true,
      minify: false,
    },
  });
  return readFileSync(join(dir, "dist/index.html"), "utf8");
};

beforeEach(() => {
  // realpathSync resolves the macOS /var -> /private/var symlink, otherwise
  // Vite computes an unstable relative path for the emitted HTML asset.
  dir = realpathSync(mkdtempSync(join(tmpdir(), "recorder-plugin-vite-")));
  writeMainTs();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("Vite plugin integration", () => {
  it("injects the recorder script into the emitted HTML in development builds", async () => {
    writeIndexHtml(STANDARD_INDEX_HTML);
    const html = await runBuild({ recordingToken: "tok-123" }, "development");
    expect(html).toContain('data-recording-token="tok-123"');
    expect(html).toContain('data-is-production-environment="false"');
    expect(html).toContain(
      'src="https://snippet.meticulous.ai/v1/meticulous.js"',
    );
  });

  it("does NOT inject in a production build with default `enabled`", async () => {
    writeIndexHtml(STANDARD_INDEX_HTML);
    const html = await runBuild({ recordingToken: "tok-123" }, "production");
    expect(html).not.toContain("snippet.meticulous.ai");
    expect(html).not.toContain("data-recording-token");
  });

  it("injects in a production build when `enabled: 'always'`, with data-is-production-environment=true", async () => {
    writeIndexHtml(STANDARD_INDEX_HTML);
    const html = await runBuild(
      { recordingToken: "tok-123", enabled: "always" },
      "production",
    );
    expect(html).toContain('data-recording-token="tok-123"');
    expect(html).toContain('data-is-production-environment="true"');
  });

  it("respects `inject: 'replace'` and swaps the user's placeholder script tag", async () => {
    writeIndexHtml(
      '<!doctype html><html><head><script data-meticulous></script><title>x</title></head><body><script type="module" src="/main.ts"></script></body></html>',
    );
    const html = await runBuild(
      { recordingToken: "tok-123", inject: "replace" },
      "development",
    );
    expect(html).toContain('data-recording-token="tok-123"');
    // The placeholder tag should have been replaced, not duplicated.
    const matches = html.match(/data-recording-token="tok-123"/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(html).not.toMatch(/<script\s+data-meticulous>\s*<\/script>/);
  });
});
