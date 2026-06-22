import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { resolveOptions } from "../options";
import {
  getHtmlRspackPluginModuleIds,
  isAlreadyInjected,
} from "../rspack-html-hooks";
import { buildScriptTag } from "../snippet";

const tryRequireFromCwd = <T>(moduleId: string): T | null => {
  try {
    return createRequire(`${process.cwd()}/__noop__.js`)(moduleId) as T;
  } catch {
    return null;
  }
};

describe("rspack-html-hooks", () => {
  it("includes module ids needed for rspack and rsbuild HTML hook resolution", () => {
    expect(getHtmlRspackPluginModuleIds()).toEqual([
      "@rspack/core",
      "html-rspack-plugin",
      "@rsbuild/core/compiled/html-rspack-plugin",
    ]);
  });

  it("can require @rspack/core and access HtmlRspackPlugin.getCompilationHooks", () => {
    const rspackCore = tryRequireFromCwd<{
      HtmlRspackPlugin?: {
        getCompilationHooks?: (compilation: unknown) => unknown;
      };
    }>("@rspack/core");

    expect(rspackCore?.HtmlRspackPlugin?.getCompilationHooks).toBeTypeOf(
      "function",
    );
  });

  it("detects when the exact built script tag is already present", () => {
    const options = resolveOptions({ recordingToken: "abc" });
    const scriptTag = buildScriptTag(options, { isProduction: false });
    const html = `<html><head>${scriptTag}<title>x</title></head></html>`;

    expect(isAlreadyInjected(html, options, scriptTag)).toBe(true);
    expect(
      isAlreadyInjected("<html><head></head></html>", options, scriptTag),
    ).toBe(false);
  });

  it("detects HTML-escaped recording tokens from buildScriptTag output", () => {
    const options = resolveOptions({ recordingToken: 'evil"<>&value' });
    const scriptTag = buildScriptTag(options, { isProduction: false });
    const html = `<html><head>${scriptTag}</head></html>`;

    expect(
      isAlreadyInjected(
        html,
        options,
        '<script data-recording-token="evil"><>&value"></script>',
      ),
    ).toBe(true);
    expect(
      html.includes('data-recording-token="evil&quot;&lt;&gt;&amp;value"'),
    ).toBe(true);
  });

  it("detects overridden data-recording-token and snippet src attributes", () => {
    const options = resolveOptions({
      recordingToken: "ignored",
      attributes: {
        "data-recording-token": "override-token",
        src: "https://example.test/snippet.js",
      },
    });
    const scriptTag = buildScriptTag(options, { isProduction: false });
    const html =
      '<html><head><script data-recording-token="override-token" src="https://example.test/snippet.js"></script></head></html>';

    expect(isAlreadyInjected(html, options, scriptTag)).toBe(true);
  });

  it("prevents duplicate injection when beforeEmit output is checked by processAssets", () => {
    const options = resolveOptions({ recordingToken: 'tok"special' });
    const scriptTag = buildScriptTag(options, { isProduction: false });
    const afterBeforeEmit = `<html><head>${scriptTag}<title>x</title></head></html>`;

    expect(isAlreadyInjected(afterBeforeEmit, options, scriptTag)).toBe(true);
    const matches =
      afterBeforeEmit.match(/data-recording-token=/g)?.length ?? 0;
    expect(matches).toBe(1);
  });
});
