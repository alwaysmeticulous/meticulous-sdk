import { createRequire } from "node:module";
import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";
import type { ConfigEnv } from "vite";
import { resolveOptions } from "./core/options";
import {
  applyInjection,
  tapHtmlBeforeEmitHooks,
  tapHtmlProcessAssetsFallback,
} from "./core/rspack-html-hooks";
import { shouldInject } from "./core/should-inject";
import { buildScriptTag } from "./core/snippet";
import type { EnabledContext, Options } from "./types";

const PLUGIN_NAME = "@alwaysmeticulous/recorder-plugin";

const tryRequire = <T>(moduleId: string, from: string): T | null => {
  try {
    const require_ = createRequire(from);
    return require_(moduleId) as T;
  } catch {
    return null;
  }
};

const tryRequireFromCwd = <T>(moduleId: string): T | null => {
  return tryRequire<T>(moduleId, `${process.cwd()}/__noop__.js`);
};

const isProductionMode = (mode: string | undefined): boolean =>
  mode === "production";

export const unpluginFactory: UnpluginFactory<Options | undefined, false> = (
  rawOptions,
) => {
  const options = resolveOptions(rawOptions);

  let viteEnv: ConfigEnv | undefined;

  return {
    name: PLUGIN_NAME,
    enforce: "pre",

    vite: {
      config(_config, env) {
        viteEnv = env;
      },
      transformIndexHtml: {
        order: "post",
        handler(html) {
          const mode = viteEnv?.mode ?? process.env["NODE_ENV"];
          const command = viteEnv?.command;
          const ctx: EnabledContext = {
            framework: "vite",
            mode,
            command,
            isProduction: command === "build" && isProductionMode(mode),
          };
          if (!shouldInject(options.enabled, ctx)) {
            return html;
          }
          const scriptTag = buildScriptTag(options, {
            isProduction: ctx.isProduction,
          });
          return applyInjection(html, scriptTag, options, {
            warn: (message) => console.warn(`[${PLUGIN_NAME}] ${message}`),
          });
        },
      },
    },

    webpack(compiler) {
      const mode = compiler.options.mode ?? process.env["NODE_ENV"] ?? undefined;
      const ctx: EnabledContext = {
        framework: "webpack",
        mode,
        isProduction: isProductionMode(mode),
      };
      if (!shouldInject(options.enabled, ctx)) {
        return;
      }

      const scriptTag = buildScriptTag(options, {
        isProduction: ctx.isProduction,
      });

      const HtmlWebpackPlugin = tryRequireFromCwd<{
        getHooks?: (compilation: unknown) => {
          beforeEmit: {
            tapAsync: (
              name: string,
              handler: (
                data: { html: string; outputName: string },
                cb: (err: Error | null, data: { html: string; outputName: string }) => void,
              ) => void,
            ) => void;
          };
        };
      }>("html-webpack-plugin");

      compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
        const logger = {
          warn: (message: string) =>
            console.warn(`[${PLUGIN_NAME}] ${message}`),
        };

        const hooks = HtmlWebpackPlugin?.getHooks?.(compilation);
        if (hooks) {
          hooks.beforeEmit.tapAsync(PLUGIN_NAME, (data, cb) => {
            const html = applyInjection(data.html, scriptTag, options, logger);
            cb(null, { ...data, html });
          });
          return;
        }

        // Fallback: rewrite any emitted .html assets in processAssets.
        const { Compilation, sources } = compiler.webpack;
        compilation.hooks.processAssets.tap(
          {
            name: PLUGIN_NAME,
            stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
          },
          (assets) => {
            for (const [filename, source] of Object.entries(assets)) {
              if (!filename.endsWith(".html")) continue;
              const original = source.source().toString();
              // Skip partial/fragment HTML that isn't a full document.
              if (!/<html\b/i.test(original)) continue;
              const updated = applyInjection(
                original,
                scriptTag,
                options,
                logger,
              );
              if (updated !== original) {
                compilation.updateAsset(
                  filename,
                  new sources.RawSource(updated),
                );
              }
            }
          },
        );
      });
    },

    rspack(compiler) {
      const mode = compiler.options.mode ?? process.env["NODE_ENV"] ?? undefined;
      const ctx: EnabledContext = {
        framework: "rspack",
        mode,
        isProduction: isProductionMode(mode),
      };
      if (!shouldInject(options.enabled, ctx)) {
        return;
      }

      const scriptTag = buildScriptTag(options, {
        isProduction: ctx.isProduction,
      });

      compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
        const logger = {
          warn: (message: string) =>
            console.warn(`[${PLUGIN_NAME}] ${message}`),
        };

        tapHtmlBeforeEmitHooks({
          tryRequireModule: tryRequireFromCwd,
          compilation,
          pluginName: PLUGIN_NAME,
          scriptTag,
          options,
          logger,
        });

        tapHtmlProcessAssetsFallback({
          compilation,
          compilerRspack: compiler.rspack,
          pluginName: PLUGIN_NAME,
          scriptTag,
          options,
          logger,
        });
      });
    },
  };
};

export const RecorderPlugin: UnpluginInstance<Options | undefined, false> =
  /* #__PURE__ */ createUnplugin(unpluginFactory);

export default RecorderPlugin;

export type {
  EnabledContext,
  EnabledMode,
  EnabledOption,
  Options,
  ResolvedOptions,
  ScriptAttributeValue,
} from "./types";
