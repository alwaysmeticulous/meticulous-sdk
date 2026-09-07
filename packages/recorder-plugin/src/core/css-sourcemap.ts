import path from "node:path";
import { isCSSRequest, type Plugin } from "vite";
import {
  buildConcatenatedSourcemap,
  readCombinedSourcemap,
} from "./css-sourcemap-mapping";
import {
  groupStylesheetsByAsset,
  isEntirelyHoistedAtRules,
  locateStylesheets,
} from "./css-sourcemap-placement";
import type {
  CompiledStylesheet,
  PlacedStylesheet,
} from "./css-sourcemap-types";

const PLUGIN_NAME = "@alwaysmeticulous/recorder-plugin:css-sourcemap";

export interface CssSourcemapOptions {
  /**
   * Whether to generate CSS source maps.
   *
   * @default true
   */
  enabled?: boolean;

  /**
   * Directory that emitted source paths are made relative to. Meticulous
   * matches those paths against the repository, so this should be the
   * repository root when the Vite project sits in a subdirectory of it.
   *
   * @default the Vite project root
   */
  root?: string;

  /**
   * Disable Vite's CSS minification while this plugin is active.
   *
   * Vite minifies a CSS asset after this plugin has recorded where each
   * stylesheet landed inside it, which invalidates every recorded position.
   * Turning minification off is what makes the emitted map accurate, at the
   * cost of a larger stylesheet, so enable this plugin on the build whose
   * coverage is being collected rather than on every production build.
   *
   * Set this to `false` and the plugin emits no map at all, since it cannot
   * tell which of the surviving matches still describe the minified asset.
   *
   * @default true
   */
  disableCssMinify?: boolean;
}

/**
 * Emits a sibling `<asset>.css.map` for every CSS asset a Vite build produces,
 * so that Meticulous can attribute stylesheet coverage collected in the browser
 * back to the stylesheets in the repository.
 *
 * Vite does not emit CSS source maps for production builds (vitejs/vite#2830),
 * so without this a bundled stylesheet is opaque: coverage can only be reported
 * against the served asset, which carries a content hash and no link to source.
 * The map is reconstructed from the per-stylesheet CSS that Vite's own CSS
 * transform has already compiled.
 */
export const cssSourcemapPlugin = (
  options: CssSourcemapOptions = {},
): Plugin[] => {
  const { enabled = true, disableCssMinify = true } = options;

  if (!enabled) {
    return [];
  }

  const compiled = new Map<string, CompiledStylesheet>();
  let root = options.root;
  let cssMinified = false;

  const capture: Plugin = {
    name: `${PLUGIN_NAME}:capture`,
    apply: "build",

    config: () => (disableCssMinify ? { build: { cssMinify: false } } : {}),

    configResolved(config) {
      root ??= config.root;
      // Read back rather than assuming `disableCssMinify` won this, since the
      // resolved config is what the build actually runs with.
      cssMinified = config.build.cssMinify !== false;
    },

    // Deliberately left at the default plugin order. This has to run after
    // `vite:css` has compiled a stylesheet and before `vite:css-post` replaces
    // it with a JavaScript module; at any other position the hook is handed
    // either the pre-compilation source or a JS wrapper.
    transform(code, id) {
      // Vite's own predicate, which also accepts an id whose extension sits in
      // the query — a single-file component's styles arrive as
      // `App.vue?vue&type=style&lang.css`.
      if (!isCSSRequest(id) || !code.trim()) {
        return null;
      }

      // Keyed by the full id, since one file can contribute several
      // stylesheets — a component with both a plain and a scoped style block.
      compiled.set(id, {
        sourcePath: id.split("?")[0] ?? id,
        code,
        map: readCombinedSourcemap(() => this.getCombinedSourcemap()),
      });

      return null;
    },

    // A rebuild reuses this plugin instance, and Rollup's cache means an
    // unchanged stylesheet is never handed to `transform` a second time, so
    // what was recorded has to outlive the build that recorded it. Only the
    // stylesheets this build no longer knows about are dropped, which is what
    // stops a deleted or renamed one claiming a region in the next asset.
    buildEnd() {
      const inModuleGraph = new Set(this.getModuleIds());
      for (const id of compiled.keys()) {
        if (!inModuleGraph.has(id)) {
          compiled.delete(id);
        }
      }
    },
  };

  const emit: Plugin = {
    name: `${PLUGIN_NAME}:emit`,
    apply: "build",
    // `vite:css-post` adds the CSS asset to the bundle from its own
    // generateBundle, so emission has to come after it.
    enforce: "post",

    generateBundle(_options, bundle) {
      const cssAssets = Object.entries(bundle).flatMap(([fileName, asset]) =>
        asset.type === "asset" && fileName.endsWith(".css")
          ? [{ fileName, asset }]
          : [],
      );
      // A build with no stylesheets has nothing to say about minification.
      if (cssAssets.length === 0) {
        return;
      }

      // Minification rewrites the asset after each stylesheet's position was
      // recorded, so whatever still matched would map a fraction of the asset
      // and silently pull its neighbours' coverage onto those files. Emitting
      // nothing leaves the served CSS to be attributed as a whole instead.
      if (cssMinified) {
        this.warn(
          `CSS minification is enabled, so no CSS source map was emitted: minifying rewrites the asset ` +
            `after this plugin has recorded where each stylesheet landed in it. ` +
            `Remove \`disableCssMinify: false\` to let the plugin turn minification off for this build.`,
        );
        return;
      }

      const stylesheetsByAsset = groupStylesheetsByAsset(bundle, compiled);

      for (const { fileName, asset } of cssAssets) {
        const css = String(asset.source);
        // Restricted to the stylesheets this asset was built from. Searching
        // all of them would let a stylesheet in one chunk claim the region of
        // an identical one in another, and the loser's coverage with it.
        const owned = stylesheetsByAsset.get(fileName);
        const placed = locateStylesheets(css, owned ?? compiled);

        if (placed.length === 0) {
          this.warn(
            `Could not locate any stylesheet inside ${fileName}, so no CSS source map was emitted. ` +
              `This usually means the asset was rewritten after it was captured.`,
          );
          continue;
        }

        warnAboutMissingStylesheets({
          warn: (message) => this.warn(message),
          fileName,
          owned,
          placed,
          root: root ?? process.cwd(),
        });

        const mapFileName = `${fileName}.map`;
        this.emitFile({
          type: "asset",
          fileName: mapFileName,
          source: JSON.stringify(
            buildConcatenatedSourcemap(placed, fileName, root ?? process.cwd()),
          ),
        });

        asset.source = `${css}\n/*# sourceMappingURL=${path.basename(mapFileName)} */\n`;
      }
    },
  };

  return [capture, emit];
};

/**
 * Warns about stylesheets an asset was built from that could not be found
 * inside it, which leaves their coverage unattributed.
 *
 * Only checked when the asset's stylesheets are known from the chunk that
 * emitted it. Otherwise every stylesheet in the build is a candidate and the
 * ones missing from this asset are simply the ones that belong elsewhere.
 */
const warnAboutMissingStylesheets = ({
  warn,
  fileName,
  owned,
  placed,
  root,
}: {
  warn: (message: string) => void;
  fileName: string;
  owned: ReadonlyMap<string, CompiledStylesheet> | undefined;
  placed: PlacedStylesheet[];
  root: string;
}): void => {
  if (owned == null) {
    return;
  }

  const missing = [...owned.values()].filter(
    (stylesheet) =>
      !placed.some((entry) => entry.stylesheet === stylesheet) &&
      // Nothing was lost when a stylesheet had no body to place to begin with.
      !isEntirelyHoistedAtRules(stylesheet.code),
  );
  if (missing.length === 0) {
    return;
  }

  const names = missing
    .map(({ sourcePath }) => path.relative(root, sourcePath))
    .sort()
    .join(", ");
  warn(
    `Could not locate ${missing.length} stylesheet(s) inside ${fileName}, so their coverage will not be ` +
      `attributed to them: ${names}. This usually means a plugin rewrote them after they were captured.`,
  );
};
