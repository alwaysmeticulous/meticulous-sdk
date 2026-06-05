import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { resolveOptions } from "../options";
import { getHtmlRspackPluginModuleIds, isAlreadyInjected } from "../rspack-html-hooks";

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

  it("detects when the recorder script is already present", () => {
    const options = resolveOptions({ recordingToken: "abc" });
    expect(
      isAlreadyInjected(
        '<html><head><script data-recording-token="abc"></script></head></html>',
        options,
      ),
    ).toBe(true);
    expect(isAlreadyInjected("<html><head></head></html>", options)).toBe(
      false,
    );
  });
});
