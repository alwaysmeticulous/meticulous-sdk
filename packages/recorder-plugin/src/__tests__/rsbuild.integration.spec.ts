import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRsbuild } from "@rsbuild/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import RsbuildRecorderPlugin from "../rsbuild";
import RspackRecorderPlugin from "../rspack";
import type { Options } from "../types";

let dir: string;

const STANDARD_INDEX_HTML =
  '<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>';

const writeProjectFiles = (): void => {
  writeFileSync(join(dir, "index.html"), STANDARD_INDEX_HTML);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src/index.ts"), 'console.log("hello");');
};

const runRsbuild = async ({
  pluginOptions,
  mode,
  useRsbuildEntry,
}: {
  pluginOptions: Options;
  mode: "development" | "production";
  useRsbuildEntry: boolean;
}): Promise<string> => {
  const rsbuild = await createRsbuild({
    cwd: dir,
    rsbuildConfig: {
      source: {
        entry: {
          index: "./src/index.ts",
        },
      },
      html: {
        template: "./index.html",
      },
      output: {
        distPath: {
          root: "dist",
        },
      },
      tools: useRsbuildEntry
        ? undefined
        : {
            rspack: {
              plugins: [RspackRecorderPlugin(pluginOptions)],
            },
          },
      plugins: useRsbuildEntry
        ? [RsbuildRecorderPlugin(pluginOptions)]
        : undefined,
      mode,
    },
  });

  await rsbuild.build();

  return readFileSync(join(dir, "dist/index.html"), "utf8");
};

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "recorder-plugin-rsbuild-")));
  writeProjectFiles();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("Rsbuild plugin integration", () => {
  it("injects via tools.rspack when using the rspack entry", async () => {
    const html = await runRsbuild({
      pluginOptions: { recordingToken: "tok-rspack", enabled: "always" },
      mode: "development",
      useRsbuildEntry: false,
    });
    expect(html).toContain('data-recording-token="tok-rspack"');
    expect(html).toContain(
      'src="https://snippet.meticulous.ai/v1/meticulous.js"',
    );
  });

  it("injects via the dedicated rsbuild entry", async () => {
    const html = await runRsbuild({
      pluginOptions: { recordingToken: "tok-rsbuild", enabled: "always" },
      mode: "development",
      useRsbuildEntry: true,
    });
    expect(html).toContain('data-recording-token="tok-rsbuild"');
    expect(html).toContain(
      'src="https://snippet.meticulous.ai/v1/meticulous.js"',
    );
  });

  it("does NOT inject in production with default `enabled`", async () => {
    const html = await runRsbuild({
      pluginOptions: { recordingToken: "tok-rsbuild" },
      mode: "production",
      useRsbuildEntry: true,
    });
    expect(html).not.toContain("snippet.meticulous.ai");
    expect(html).not.toContain("data-recording-token");
  });
});
