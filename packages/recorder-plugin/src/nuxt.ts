/**
 * Nuxt module entry.
 *
 * Injects the Meticulous recorder script into every page's `<head>` via
 * `nuxt.options.app.head.script`, which feeds into Nitro's render pipeline
 * and works regardless of whether Nuxt is using the Vite or webpack bundler.
 *
 * @example
 * ```ts
 * // nuxt.config.ts
 * export default defineNuxtConfig({
 *   modules: [
 *     [
 *       "@alwaysmeticulous/recorder-plugin/nuxt",
 *       { recordingToken: "<your-token>" },
 *     ],
 *   ],
 * });
 * ```
 */
import { defineNuxtModule } from "@nuxt/kit";
import { resolveOptions } from "./core/options";
import { shouldInject } from "./core/should-inject";
import type { EnabledContext, Options } from "./types";

export default defineNuxtModule<Options>({
  meta: {
    name: "@alwaysmeticulous/recorder-plugin",
    configKey: "meticulousRecorder",
  },
  setup(options: Options, nuxt) {
    const resolved = resolveOptions(options);

    const isProduction = !nuxt.options.dev;
    // Nuxt 3 defaults to Vite; fall back to webpack for legacy builds.
    const framework: "vite" | "webpack" =
      nuxt.options.builder === "@nuxt/webpack-builder" ? "webpack" : "vite";
    const ctx: EnabledContext = {
      framework,
      isProduction,
      mode: isProduction ? "production" : "development",
    };

    if (!shouldInject(resolved.enabled, ctx)) return;

    const scriptEntry: Record<string, string | boolean> = {
      src: resolved.snippetUrl,
      "data-recording-token": resolved.recordingToken,
      "data-is-production-environment": isProduction ? "true" : "false",
    };

    for (const [key, val] of Object.entries(resolved.attributes)) {
      if (val === false || val === null || val === undefined) continue;
      scriptEntry[key] = val === true ? true : (val as string);
    }

    nuxt.options.app.head ??= {};
    nuxt.options.app.head.script ??= [];
    // unshift so the recorder is the first script in <head>.
    (nuxt.options.app.head.script as unknown[]).unshift(scriptEntry);
  },
});
