import type { Compilation, rspack } from "@rspack/core";
import type { ResolvedOptions } from "../types";
import { injectIntoHtml } from "./inject-html";

type RspackRuntime = typeof rspack;

type Logger = {
  warn: (message: string) => void;
};

type BeforeEmitData = {
  html: string;
  outputName: string;
};

type BeforeEmitHooks = {
  beforeEmit: {
    tapAsync: (
      name: string,
      handler: (
        data: BeforeEmitData,
        cb: (err: Error | null, data: BeforeEmitData) => void,
      ) => void,
    ) => void;
  };
};

type HtmlRspackPluginLike = {
  getCompilationHooks?: (compilation: unknown) => BeforeEmitHooks;
};

const HTML_RSPACK_PLUGIN_MODULE_IDS = [
  "@rspack/core",
  "html-rspack-plugin",
  "@rsbuild/core/compiled/html-rspack-plugin",
] as const;

export const isAlreadyInjected = (
  html: string,
  options: ResolvedOptions,
): boolean => html.includes(`data-recording-token="${options.recordingToken}"`);

export const applyInjection = (
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

const hasGetCompilationHooks = (
  value: unknown,
): value is HtmlRspackPluginLike =>
  value != null &&
  (typeof value === "function" || typeof value === "object") &&
  typeof (value as HtmlRspackPluginLike).getCompilationHooks === "function";

const resolveHtmlRspackPlugin = (
  moduleExports: unknown,
): HtmlRspackPluginLike | null => {
  if (moduleExports == null) {
    return null;
  }

  const candidates: unknown[] = [moduleExports];
  if (typeof moduleExports === "function" || typeof moduleExports === "object") {
    const record = moduleExports as Record<string, unknown>;
    if (record["default"] != null) {
      candidates.push(record["default"]);
    }
    if (record["HtmlRspackPlugin"] != null) {
      candidates.push(record["HtmlRspackPlugin"]);
    }
  }

  for (const candidate of candidates) {
    if (hasGetCompilationHooks(candidate)) {
      return candidate;
    }
  }

  return null;
};

export const getHtmlRspackPluginModuleIds = (): readonly string[] =>
  HTML_RSPACK_PLUGIN_MODULE_IDS;

export const tapHtmlBeforeEmitHooks = ({
  tryRequireModule,
  compilation,
  pluginName,
  scriptTag,
  options,
  logger,
}: {
  tryRequireModule: <T>(moduleId: string) => T | null;
  compilation: unknown;
  pluginName: string;
  scriptTag: string;
  options: ResolvedOptions;
  logger: Logger;
}): void => {
  for (const moduleId of HTML_RSPACK_PLUGIN_MODULE_IDS) {
    const htmlPlugin = resolveHtmlRspackPlugin(tryRequireModule(moduleId));
    const hooks = htmlPlugin?.getCompilationHooks?.(compilation);
    if (!hooks) {
      continue;
    }

    hooks.beforeEmit.tapAsync(pluginName, (data, cb) => {
      if (isAlreadyInjected(data.html, options)) {
        cb(null, data);
        return;
      }
      const html = applyInjection(data.html, scriptTag, options, logger);
      cb(null, { ...data, html });
    });
  }
};

export const tapHtmlProcessAssetsFallback = ({
  compilation,
  compilerRspack,
  pluginName,
  scriptTag,
  options,
  logger,
}: {
  compilation: Compilation;
  compilerRspack: RspackRuntime;
  pluginName: string;
  scriptTag: string;
  options: ResolvedOptions;
  logger: Logger;
}): void => {
  const { Compilation, sources } = compilerRspack;
  compilation.hooks.processAssets.tap(
    {
      name: pluginName,
      // HTML assets are emitted after ADDITIONS; REPORT runs once they exist.
      stage: Compilation.PROCESS_ASSETS_STAGE_REPORT,
    },
    (assets) => {
      for (const [filename, source] of Object.entries(assets)) {
        if (!filename.endsWith(".html")) {
          continue;
        }
        const original = source.source().toString();
        if (!/<html\b/i.test(original)) {
          continue;
        }
        if (isAlreadyInjected(original, options)) {
          continue;
        }
        const updated = applyInjection(original, scriptTag, options, logger);
        if (updated !== original) {
          compilation.updateAsset(filename, new sources.RawSource(updated));
        }
      }
    },
  );
};
