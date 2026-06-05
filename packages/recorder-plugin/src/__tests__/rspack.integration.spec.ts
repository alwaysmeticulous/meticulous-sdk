import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rspack } from "@rspack/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import RecorderPlugin from "../rspack";
import type { Options } from "../types";

let dir: string;

const STANDARD_INDEX_HTML =
  '<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>';

const writeProjectFiles = (): void => {
  writeFileSync(join(dir, "index.html"), STANDARD_INDEX_HTML);
  writeFileSync(join(dir, "main.ts"), 'console.log("hello");');
};

const runBuild = async (
  pluginOptions: Options,
  mode: "development" | "production",
): Promise<string> => {
  const compiler = rspack({
    mode,
    context: dir,
    entry: {
      main: join(dir, "main.ts"),
    },
    output: {
      path: join(dir, "dist"),
      filename: "[name].js",
      clean: true,
    },
    plugins: [
      new rspack.HtmlRspackPlugin({
        template: join(dir, "index.html"),
      }),
      RecorderPlugin(pluginOptions),
    ],
  });

  await new Promise<void>((resolve, reject) => {
    compiler.run((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  return readFileSync(join(dir, "dist/index.html"), "utf8");
};

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "recorder-plugin-rspack-")));
  writeProjectFiles();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("Rspack plugin integration", () => {
  it("injects the recorder script into the emitted HTML in development builds", async () => {
    const html = await runBuild({ recordingToken: "tok-123" }, "development");
    expect(html).toContain('data-recording-token="tok-123"');
    expect(html).toContain('data-is-production-environment="false"');
    expect(html).toContain(
      'src="https://snippet.meticulous.ai/v1/meticulous.js"',
    );
  });

  it("does NOT inject in a production build with default `enabled`", async () => {
    const html = await runBuild({ recordingToken: "tok-123" }, "production");
    expect(html).not.toContain("snippet.meticulous.ai");
    expect(html).not.toContain("data-recording-token");
  });

  it("injects in a production build when `enabled: 'always'`", async () => {
    const html = await runBuild(
      { recordingToken: "tok-123", enabled: "always" },
      "production",
    );
    expect(html).toContain('data-recording-token="tok-123"');
    expect(html).toContain('data-is-production-environment="true"');
    const matches = html.match(/data-recording-token="tok-123"/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
