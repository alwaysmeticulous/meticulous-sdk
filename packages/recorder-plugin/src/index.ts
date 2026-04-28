import { createRequire } from "node:module";
import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";
import type { ConfigEnv as ViteConfigEnv } from "vite";
import { injectIntoHtml } from "./core/inject-html";
import { resolveOptions } from "./core/options";
import { shouldInject } from "./core/should-inject";
import { buildScriptTag } from "./core/snippet";
import type { EnabledContext, Options, ResolvedOptions } from "./types";

const PLUGIN_NAME = "@alwaysmeticulous/recorder-plugin";

type Logger = {
  warn: (message: string) => void;
};

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

const applyInjection = (
  html: string,
  scriptTag: string,
  options: ResolvedOptions,
  logger: Logger,
): string => {
  const result = injectIntoHtml(
    html,
    scriptTag,
    options.inject,
    options.placeholderAttribute,
  );
  if (result.warning) {
    logger.warn(result.warning);
  }
  return result.html;
};

const isProductionMode = (mode: string | undefined): boolean =>
  mode === "production";

export const unpluginFactory: UnpluginFactory<Options | undefined, false> = (
  rawOptions,
) => {
  const options = resolveOptions(rawOptions);

  let viteEnv: ViteConfigEnv | undefined;

  return {
    name: PLUGIN_NAME,
    enforce: "pre",

    vite: {
      config(_config, env) {
        viteEnv = env;
      },
      transformIndexHtml: {
        order: "pre",
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

      const rspackCore = tryRequireFromCwd<{
        HtmlRspackPlugin?: {
          getCompilationHooks?: (compilation: unknown) => {
            beforeEmit: {
              tapAsync: (
                name: string,
                handler: (
                  data: { html: string; outputName: string },
                  cb: (
                    err: Error | null,
                    data: { html: string; outputName: string },
                  ) => void,
                ) => void,
              ) => void;
            };
          };
        };
      }>("@rspack/core");

      compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
        const logger = {
          warn: (message: string) =>
            console.warn(`[${PLUGIN_NAME}] ${message}`),
        };

        const hooks =
          rspackCore?.HtmlRspackPlugin?.getCompilationHooks?.(compilation);
        if (hooks) {
          hooks.beforeEmit.tapAsync(PLUGIN_NAME, (data, cb) => {
            const html = applyInjection(data.html, scriptTag, options, logger);
            cb(null, { ...data, html });
          });
          return;
        }

        // Fallback: rewrite any emitted .html assets in processAssets.
        const { Compilation, sources } = compiler.rspack;
        compilation.hooks.processAssets.tap(
          {
            name: PLUGIN_NAME,
            stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
          },
          (assets: Record<string, { source(): string | Buffer }>) => {
            for (const [filename, source] of Object.entries(assets)) {
              if (!filename.endsWith(".html")) continue;
              const original = source.source().toString();
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
