/**
 * Rsbuild plugin entry.
 *
 * @example
 * ```ts
 * // rsbuild.config.ts
 * import { defineConfig } from "@rsbuild/core";
 * import meticulous from "@alwaysmeticulous/recorder-plugin/rsbuild";
 *
 * export default defineConfig({
 *   plugins: [
 *     meticulous({ recordingToken: "<your-token>" }),
 *   ],
 * });
 * ```
 */
import type { RsbuildPlugin } from "@rsbuild/core";
import { resolveOptions } from "./core/options";
import {
  applyInjection,
  isAlreadyInjected,
} from "./core/rspack-html-hooks";
import { shouldInject } from "./core/should-inject";
import { buildScriptTag } from "./core/snippet";
import type { Options } from "./types";

const PLUGIN_NAME = "@alwaysmeticulous/recorder-plugin";

const createRsbuildPlugin = (rawOptions?: Options): RsbuildPlugin => ({
  name: PLUGIN_NAME,
  setup(api) {
    const options = resolveOptions(rawOptions);

    api.modifyHTML((html, { compiler }) => {
      const mode =
        compiler.options.mode ?? process.env["NODE_ENV"] ?? undefined;
      const ctx = {
        framework: "rspack" as const,
        mode,
        isProduction: mode === "production",
      };
      if (!shouldInject(options.enabled, ctx)) {
        return html;
      }

      const scriptTag = buildScriptTag(options, {
        isProduction: ctx.isProduction,
      });
      if (isAlreadyInjected(html, options, scriptTag)) {
        return html;
      }
      return applyInjection(html, scriptTag, options, {
        warn: (message) => console.warn(`[${PLUGIN_NAME}] ${message}`),
      });
    });
  },
});

export default createRsbuildPlugin;
