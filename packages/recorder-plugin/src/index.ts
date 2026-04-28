import { createUnplugin, type UnpluginFactory, type UnpluginInstance } from "unplugin";
import { resolveOptions } from "./core/options";
import type { Options } from "./types";

const PLUGIN_NAME = "@alwaysmeticulous/recorder-plugin";

/**
 * The unplugin factory.
 *
 * Imported by each per-bundler entry (`./vite`, `./webpack`, `./rspack`, etc.)
 * via the matching `unplugin` factory helper (`createVitePlugin`,
 * `createWebpackPlugin`, ...).
 *
 * This is a template implementation: the `transform` hook prepends a marker
 * comment to every matched module so the plugin wiring can be verified
 * end-to-end in each supported bundler. Replace the body of `transform.handler`
 * with the real recorder injection logic.
 */
export const unpluginFactory: UnpluginFactory<Options | undefined, false> = (
  rawOptions,
) => {
  const options = resolveOptions(rawOptions ?? {});
  return {
    name: PLUGIN_NAME,
    enforce: options.enforce,
    transform: {
      filter: {
        id: { include: options.include, exclude: options.exclude },
      },
      handler(code) {
        return `/* ${PLUGIN_NAME} injected */\n${code}`;
      },
    },
  };
};

export const RecorderPlugin: UnpluginInstance<Options | undefined, false> =
  /* #__PURE__ */ createUnplugin(unpluginFactory);

export default RecorderPlugin;

export type { Options, ResolvedOptions } from "./types";
