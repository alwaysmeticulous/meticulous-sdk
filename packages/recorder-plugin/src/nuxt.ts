/**
 * Nuxt module entry.
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
 *
 * The module installs the Vite plugin (when Nuxt is using Vite, the default in
 * Nuxt 3) and the webpack plugin (when Nuxt is using webpack), so the
 * recorder script is injected into the rendered HTML regardless of bundler.
 */
import { addVitePlugin, addWebpackPlugin, defineNuxtModule } from "@nuxt/kit";
import type { Options } from "./types";
import vitePlugin from "./vite";
import webpackPlugin from "./webpack";

export default defineNuxtModule<Options>({
  meta: {
    name: "@alwaysmeticulous/recorder-plugin",
    configKey: "meticulousRecorder",
  },
  setup(options: Options) {
    addVitePlugin(() => vitePlugin(options));
    addWebpackPlugin(() => webpackPlugin(options));
  },
});
