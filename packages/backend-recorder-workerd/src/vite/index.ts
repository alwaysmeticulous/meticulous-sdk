import * as path from "node:path";
import { instrumentModule, type OriginalLineResolver } from "./instrument";
import {
  MetTraceMap,
  type RawSourceMapLike,
} from "./met-workerd-trace-mapping";

/**
 * Vite plugin that instruments a Worker's server modules for Meticulous line
 * coverage.
 *
 * Add it to the build you upload for testing — not the one you ship:
 *
 *   import { meticulousCoverage } from "@alwaysmeticulous/backend-recorder-workerd/vite";
 *   export default defineConfig({ plugins: [meticulousCoverage()] });
 *
 * `enforce: "post"` is deliberate: by then Vite's esbuild pass has already
 * stripped TypeScript and JSX, so the instrumenter only ever sees plain JS and
 * needs no TS-aware parser. Anything it still cannot parse is passed through
 * untouched — coverage is never worth failing a customer's build for.
 *
 * The cost of running last is that AST line numbers are lines in the re-printed
 * module, not in the file the customer wrote — that pass drops comments and
 * blank lines, which on a commented codebase shifts nearly every statement. So
 * each marker's line is resolved back through `getCombinedSourcemap()`, the
 * transform chain's accumulated map, which is only available here in the
 * transform hook.
 */

/**
 * The slice of Vite's transform-hook context this uses. Optional because the
 * plugin must still work when called without one — a bare `plugin.transform(...)`
 * in a test, or a host that does not provide the hook.
 */
export interface TransformContextLike {
  getCombinedSourcemap?: () => unknown;
}

/**
 * How a module's lines will be resolved. `identity` means the code arrived
 * untransformed (or the host offered no map), so its own lines are the source's;
 * `unattributed` means a map exists but covers some other file, which is the one
 * case where instrumenting at all would report wrong lines.
 */
type LineResolution =
  | { kind: "mapped" | "identity"; resolveOriginalLine: OriginalLineResolver }
  | { kind: "unattributed" };

/** Structural subset of a Vite plugin — avoids depending on vite's types. */
export interface VitePluginLike {
  name: string;
  enforce?: "pre" | "post";
  configResolved?: (config: { root?: string }) => void;
  transform?: (
    this: TransformContextLike | undefined,
    code: string,
    id: string,
    options?: { ssr?: boolean },
  ) => { code: string; map: string } | null;
  buildEnd?: () => void;
}

export interface MeticulousCoverageOptions {
  /**
   * Instrument client modules too. Off by default: only the server build runs
   * inside workerd, and it is the only side Meticulous replays.
   */
  includeClient?: boolean;
  /** Extra paths to leave uninstrumented, on top of node_modules and virtual modules. */
  exclude?: RegExp[];
  /** Overrides where the injected runtime import points (tests use this). */
  runtimeModuleId?: string;
  /** Receives a warning when the build produced no instrumentation at all. */
  onWarning?: (message: string) => void;
}

const RUNTIME_MODULE_ID = "@alwaysmeticulous/backend-recorder-workerd";

const INSTRUMENTABLE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".vue",
  ".svelte",
]);

/**
 * The scheme pattern needs at least two characters before the colon, so a
 * Windows drive letter is not mistaken for a protocol: Vite hands the transform
 * hook ids like `C:/repo/src/handler.ts` there, and a single-letter scheme would
 * exclude every real module on Windows — a build that instruments nothing and
 * says only that it instrumented nothing.
 */
const ALWAYS_EXCLUDED = [/node_modules/, /\bvirtual:/, /^[a-z][a-z\d+.-]+:/i];

/**
 * Rollup prefixes a virtual module id with a NUL byte. Matched as a string
 * rather than a regex because a control character in a regex is a lint error,
 * and this needs no pattern matching anyway.
 */
const ROLLUP_VIRTUAL_PREFIX = "\u0000";

export const meticulousCoverage = (
  options: MeticulousCoverageOptions = {},
): VitePluginLike => {
  const runtimeModuleId = options.runtimeModuleId ?? RUNTIME_MODULE_ID;
  const exclude = [...ALWAYS_EXCLUDED, ...(options.exclude ?? [])];
  const warn =
    options.onWarning ??
    ((message: string) => {
      // eslint-disable-next-line no-console
      console.warn(`[meticulous] ${message}`);
    });

  let root = process.cwd();
  let nextId = 0;
  let instrumentedFiles = 0;
  let unmappedFiles = 0;
  let unattributedFiles = 0;
  let droppedMarkers = 0;

  return {
    name: "meticulous-coverage",
    enforce: "post",

    configResolved(config) {
      root = config.root ?? root;
    },

    transform(
      this: TransformContextLike | undefined,
      code,
      id,
      transformOptions,
    ) {
      if (!options.includeClient && transformOptions?.ssr !== true) {
        return null;
      }
      const filePath = id.split("?")[0];
      if (!isInstrumentable(filePath, exclude)) {
        return null;
      }

      const resolver = buildLineResolver(this, filePath);
      if (resolver.kind === "unattributed") {
        // A map that does not cover this file leaves no way to tell a real line
        // from a shifted one, so instrument nothing rather than report guesses.
        unattributedFiles++;
        return null;
      }
      if (resolver.kind === "identity") {
        unmappedFiles++;
      }

      const relativePath = toRelativePath(filePath, root);
      const firstId = nextId;
      const result = instrumentModule({
        code,
        fileName: relativePath,
        firstId,
        runtimeModuleId,
        resolveOriginalLine: resolver.resolveOriginalLine,
      });
      if (result === null) {
        return null;
      }

      nextId += result.lineRanges.length;
      droppedMarkers += result.droppedMarkers;
      instrumentedFiles++;

      return {
        code: `${result.code}\n${registration({
          relativePath,
          firstId,
          lineRanges: result.lineRanges,
          runtimeModuleId,
        })}\n`,
        map: result.map,
      };
    },

    buildEnd() {
      const gaps = describeMappingGaps({
        unmappedFiles,
        unattributedFiles,
        droppedMarkers,
      });
      if (instrumentedFiles === 0) {
        // Silence here would look identical to a working build that simply
        // covered nothing, and the replay would report 0% with no clue why. The
        // gaps matter most on this branch: they are the reason it is zero.
        warn(
          `Meticulous coverage instrumented no modules. If this is a Cloudflare Workers build, check that the plugin is applied to the server environment (it only instruments SSR modules unless includeClient is set).${gaps}`,
        );
        return;
      }
      warn(
        `Meticulous coverage instrumented ${instrumentedFiles} module(s), ${nextId} line marker(s).${gaps}`,
      );
    },
  };
};

/**
 * Appended to the build summary so a run that quietly lost lines to source-map
 * gaps says so, instead of looking identical to one that mapped everything.
 */
const describeMappingGaps = ({
  unmappedFiles,
  unattributedFiles,
  droppedMarkers,
}: {
  unmappedFiles: number;
  unattributedFiles: number;
  droppedMarkers: number;
}): string => {
  const gaps: string[] = [];
  if (unmappedFiles > 0) {
    gaps.push(
      `${unmappedFiles} module(s) had no source map, so their lines are as the build printed them`,
    );
  }
  if (unattributedFiles > 0) {
    gaps.push(
      `${unattributedFiles} module(s) skipped because their source map does not cover them`,
    );
  }
  if (droppedMarkers > 0) {
    gaps.push(`${droppedMarkers} marker(s) had no original line`);
  }
  return gaps.length === 0 ? "" : ` (${gaps.join("; ")}.)`;
};

/**
 * The module's own slice of the id space, registered as a side effect of the
 * module being evaluated. Appended after the module body so it cannot run
 * before the module's own bindings are initialised.
 */
const registration = ({
  relativePath,
  firstId,
  lineRanges,
  runtimeModuleId,
}: {
  relativePath: string;
  firstId: number;
  lineRanges: Array<[number, number]>;
  runtimeModuleId: string;
}): string =>
  [
    `import {registerCoverageFile as __mcR$} from ${JSON.stringify(runtimeModuleId)};`,
    `__mcR$({path:${JSON.stringify(relativePath)},firstId:${firstId},lineRanges:[${lineRanges.flat().join(",")}]});`,
  ].join("\n");

const identity: OriginalLineResolver = (line) => line;

/**
 * Builds the resolver that turns positions in the transformed module back into
 * original source lines.
 *
 * Every failure to obtain a map degrades to the identity rather than skipping
 * the module: a module nothing transformed is already in source coordinates, and
 * for one whose map a plugin dropped, the build summary reports the count rather
 * than coverage silently vanishing.
 */
const buildLineResolver = (
  context: TransformContextLike | undefined,
  filePath: string,
): LineResolution => {
  const map = readCombinedSourcemap(context);
  if (map === null) {
    return { kind: "identity", resolveOriginalLine: identity };
  }
  let tracer: MetTraceMap;
  try {
    tracer = new MetTraceMap(map);
  } catch {
    return { kind: "identity", resolveOriginalLine: identity };
  }
  const ownIndex = ownSourceIndex(tracer.sources, filePath);
  if (ownIndex === null) {
    return { kind: "unattributed" };
  }
  return {
    kind: "mapped",
    resolveOriginalLine: (line, column) => {
      const position = tracer.originalPositionFor(line, column);
      if (position === null || position.sourceIndex !== ownIndex) {
        return null;
      }
      return position.line;
    },
  };
};

const readCombinedSourcemap = (
  context: TransformContextLike | undefined,
): RawSourceMapLike | null => {
  const getCombinedSourcemap = context?.getCombinedSourcemap;
  if (typeof getCombinedSourcemap !== "function") {
    return null;
  }
  let map: unknown;
  try {
    map = getCombinedSourcemap.call(context);
  } catch {
    return null;
  }
  if (map === null || typeof map !== "object") {
    return null;
  }
  const candidate = map as RawSourceMapLike;
  // A sectioned map describes a bundle rather than one module's transform chain,
  // which Vite never hands a transform hook; the fork does not flatten them.
  if (candidate.sections != null || candidate.mappings == null) {
    return null;
  }
  return candidate;
};

/**
 * Which entry of the map's `sources` is the module being transformed.
 *
 * A single-source map can only describe this module, so it is taken as such
 * without comparing paths — Vite writes an absolute path there, but a plugin
 * earlier in the chain may have written anything. With several sources the path
 * has to be matched, and a position mapping to one of the others is a fragment
 * injected from elsewhere, which this module must not claim.
 */
const ownSourceIndex = (
  sources: Array<string | null>,
  filePath: string,
): number | null => {
  if (sources.length === 1) {
    return 0;
  }
  const target = normalizeForCompare(filePath);
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    if (source == null || source === "") {
      continue;
    }
    const candidate = normalizeForCompare(source);
    if (
      candidate === target ||
      candidate.endsWith(`/${target}`) ||
      target.endsWith(`/${candidate}`)
    ) {
      return index;
    }
  }
  return null;
};

/** Posix-separated and query-free, so a source and a module id are comparable. */
const normalizeForCompare = (value: string): string =>
  value.split("?")[0].split(path.sep).join("/").replace(/^\.\//, "");

const isInstrumentable = (filePath: string, exclude: RegExp[]): boolean => {
  if (filePath.startsWith(ROLLUP_VIRTUAL_PREFIX)) {
    return false;
  }
  if (exclude.some((pattern) => pattern.test(filePath))) {
    return false;
  }
  return INSTRUMENTABLE_EXTENSIONS.has(path.extname(filePath));
};

/**
 * Root-relative and posix-separated, so the recorded path matches the repo
 * layout the post-process resolves coverage against.
 */
const toRelativePath = (filePath: string, root: string): string => {
  const relative = path.relative(root, filePath);
  const normalised = relative.split(path.sep).join("/");
  return normalised.startsWith("..") ? filePath : normalised;
};
