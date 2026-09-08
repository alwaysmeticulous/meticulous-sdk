import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import type { RawSourceMap } from "./css-sourcemap-types";

const TAILWIND_GENERATE_PLUGINS = new Set([
  "@tailwindcss/vite:generate:build",
  "@tailwindcss/vite:generate:serve",
]);

/**
 * Tailwind's Vite plugin already calls `compiler.buildSourceMap()` when
 * `css.devSourcemap` is on, and the result names every `@import`ed file.
 * Vite's `getCombinedSourcemap()` then drops that graph — either the sources
 * array is emptied after Lightning optimize, or it is collapsed to the entry
 * module id. Intercepting the transform result is what keeps the import
 * sources so coverage can attribute to those files.
 */
export const interceptTailwindSourcemaps = (
  plugins: readonly Plugin[],
  stash: Map<string, RawSourceMap>,
): void => {
  for (const plugin of plugins) {
    if (!TAILWIND_GENERATE_PLUGINS.has(plugin.name)) {
      continue;
    }
    wrapTransform(plugin, (id, map) => {
      const normalized = normalizePreprocessorSourcemap(map, id);
      if (normalized == null) {
        return;
      }
      rememberMap(stash, id, normalized);
    });
  }
};

export const lookupPreprocessorMap = (
  stash: ReadonlyMap<string, RawSourceMap>,
  id: string,
): RawSourceMap | null =>
  stash.get(id) ?? stash.get(id.split("?")[0] ?? id) ?? null;

/**
 * Lightning CSS `optimize` strips the leading separator from absolute paths
 * (`/Users/a.css` → `Users/a.css`) and inserts a synthetic `input.css` source
 * for the generated output. Restore those so emitted paths match the repo.
 */
export const normalizePreprocessorSourcemap = (
  map: unknown,
  entryId: string,
): RawSourceMap | null => {
  const parsed = parseSourceMap(map);
  if (parsed == null || parsed.mappings === "" || parsed.sources.length === 0) {
    return null;
  }
  const entryFile = entryId.split("?")[0] ?? entryId;
  return {
    ...parsed,
    sources: parsed.sources.map((source) =>
      restoreAbsoluteSource(source, entryFile),
    ),
  };
};

export const restoreAbsoluteSource = (
  source: string,
  entryFile: string,
): string => {
  if (source === "input.css") {
    return entryFile;
  }
  if (source.startsWith("file://")) {
    try {
      return fileURLToPath(source);
    } catch {
      // Not a well-formed file URL; fall through.
    }
  }
  if (path.isAbsolute(source)) {
    return source;
  }
  const restored = `${path.sep}${source}`;
  if (path.isAbsolute(restored) && existsSync(restored)) {
    return restored;
  }
  return path.resolve(path.dirname(entryFile), source);
};

const rememberMap = (
  stash: Map<string, RawSourceMap>,
  id: string,
  map: RawSourceMap,
): void => {
  const keys = new Set([id, id.split("?")[0] ?? id]);
  for (const key of keys) {
    const existing = stash.get(key);
    if (existing != null && existing.sources.length >= map.sources.length) {
      continue;
    }
    stash.set(key, map);
  }
};

const parseSourceMap = (map: unknown): RawSourceMap | null => {
  const value = typeof map === "string" ? parseJson(map) : map;
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as RawSourceMap).mappings !== "string" ||
    !Array.isArray((value as RawSourceMap).sources)
  ) {
    return null;
  }
  return value as RawSourceMap;
};

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

type TransformFn = (
  this: unknown,
  code: string,
  id: string,
  options?: unknown,
) => unknown;

const wrapTransform = (
  plugin: Plugin,
  onMap: (id: string, map: unknown) => void,
): void => {
  const transform = plugin.transform;
  if (transform == null) {
    return;
  }
  if (typeof transform === "function") {
    plugin.transform = function (
      this: unknown,
      code: string,
      id: string,
      options?: unknown,
    ) {
      return tapMap(transform.call(this, code, id, options), id, onMap);
    };
    return;
  }
  if (
    typeof transform !== "object" ||
    typeof transform.handler !== "function"
  ) {
    return;
  }
  const handler = transform.handler as TransformFn;
  transform.handler = function (
    this: unknown,
    code: string,
    id: string,
    options?: unknown,
  ) {
    return tapMap(handler.call(this, code, id, options), id, onMap);
  };
};

const tapMap = (
  result: unknown,
  id: string,
  onMap: (id: string, map: unknown) => void,
): unknown => {
  if (isPromise(result)) {
    return result.then((resolved) => inspectResult(resolved, id, onMap));
  }
  return inspectResult(result, id, onMap);
};

const inspectResult = (
  result: unknown,
  id: string,
  onMap: (id: string, map: unknown) => void,
): unknown => {
  if (result != null && typeof result === "object" && "map" in result) {
    onMap(id, result.map);
  }
  return result;
};

const isPromise = (value: unknown): value is Promise<unknown> =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Promise<unknown>).then === "function";
