import type { Rollup } from "vite";
import type {
  AssetRegion,
  CompiledStylesheet,
  PlacedStylesheet,
} from "./css-sourcemap-types";

/**
 * Stand-in Vite leaves in CSS for an asset whose final URL isn't known yet. A
 * reference that carries a query or a fragment, such as `url("sprite.svg#id")`,
 * puts it in the trailing `$_…__` group.
 */
const ASSET_PLACEHOLDER = /__VITE(?:_PUBLIC)?_ASSET__[\w$]+__(?:\$_.*?__)?/g;

/**
 * Finds where each compiled stylesheet was placed inside the concatenated CSS
 * asset. A stylesheet that cannot be found is skipped, so that one rewritten by
 * another plugin does not corrupt its neighbours' offsets.
 */
export const locateStylesheets = (
  css: string,
  compiled: ReadonlyMap<string, CompiledStylesheet>,
): PlacedStylesheet[] => {
  const placed: PlacedStylesheet[] = [];
  const claimed: AssetRegion[] = [];

  // Longest first, so that a stylesheet whose CSS contains another's claims its
  // full region before the shorter one can take a position inside it.
  const byLengthDescending = [...compiled.values()].sort(
    (a, b) => b.code.trim().length - a.code.trim().length,
  );

  for (const stylesheet of byLengthDescending) {
    const body = locateBody(css, stylesheet.code.trim(), claimed);
    if (body == null) {
      continue;
    }
    claimed.push(body.region);

    const preceding = css.slice(0, body.region.start);
    placed.push({
      id: stylesheet.sourcePath,
      stylesheet,
      line: preceding.split("\n").length - 1,
      // Vite can concatenate one stylesheet's last line and the next
      // stylesheet's first onto a single physical line, so the offset within
      // that line is what keeps their mappings apart.
      column: body.region.start - (preceding.lastIndexOf("\n") + 1),
      skippedLines: body.skippedLines,
      span: body.text.split("\n").length,
    });
  }

  return placed.sort((a, b) => a.line - b.line || a.column - b.column);
};

/**
 * Works out which stylesheets each CSS asset was built from, by way of the
 * chunk that emitted it. Assets with no chunk claiming them are left out, and
 * fall back to being searched against every stylesheet.
 */
export const groupStylesheetsByAsset = (
  bundle: Rollup.OutputBundle,
  compiled: ReadonlyMap<string, CompiledStylesheet>,
): Map<string, Map<string, CompiledStylesheet>> => {
  const byAsset = new Map<string, Map<string, CompiledStylesheet>>();

  for (const output of Object.values(bundle)) {
    if (output.type !== "chunk") {
      continue;
    }

    const assetFileName = findOwnCssAsset(bundle, output);
    if (assetFileName == null) {
      continue;
    }

    let stylesheets = byAsset.get(assetFileName);
    if (stylesheets == null) {
      stylesheets = new Map();
      byAsset.set(assetFileName, stylesheets);
    }
    for (const id of output.moduleIds) {
      const stylesheet = compiled.get(id);
      if (stylesheet != null && isExtractedIntoChunkAsset(id)) {
        stylesheets.set(id, stylesheet);
      }
    }
    if (stylesheets.size === 0) {
      byAsset.delete(assetFileName);
    }
  }

  return byAsset;
};

/**
 * Whether a stylesheet is folded into the CSS asset of the chunk that imports
 * it, rather than reaching the browser some other way.
 *
 * `?inline` and `?raw` hand the stylesheet to JavaScript as a string, and
 * `?url` emits it as an asset of its own alongside a `?transform-only` copy
 * Vite compiles but never bundles. None of them appear in their importing
 * chunk's asset even though they all stay listed among its modules.
 */
const isExtractedIntoChunkAsset = (id: string): boolean => {
  const query = id.split("?")[1];
  if (query == null) {
    return true;
  }

  const params = new URLSearchParams(query);
  return !NON_EXTRACTED_QUERIES.some((flag) => params.has(flag));
};

const NON_EXTRACTED_QUERIES = ["inline", "raw", "url", "transform-only"];

/**
 * The CSS asset a chunk emitted itself, or null when that cannot be told apart
 * from the ones it merely pulls in.
 *
 * A chunk emits at most one CSS asset, but `importedCss` also carries the
 * assets of pure-CSS chunks folded into it, whose modules are no longer listed
 * anywhere. Attributing this chunk's stylesheets to one of those would hand a
 * neighbour's coverage to whichever of them happens to match its text.
 */
const findOwnCssAsset = (
  bundle: Rollup.OutputBundle,
  chunk: Rollup.OutputChunk,
): string | null => {
  const importedCss = [...(chunk.viteMetadata?.importedCss ?? [])];
  if (importedCss.length <= 1) {
    return importedCss[0] ?? null;
  }

  // Vite names a chunk's own CSS asset after the chunk.
  const own = importedCss.filter((fileName) =>
    bundle[fileName]?.names?.includes(`${chunk.name}.css`),
  );
  return own.length === 1 ? own[0] : null;
};

/**
 * Finds the part of a stylesheet that survives into the asset as one run of
 * text, along with where it landed.
 *
 * Vite hoists `@charset` and `@import` to the top of the concatenated file, so
 * a stylesheet opening with an external import — a webfont, most often — is
 * split in two and its compiled text never appears contiguously. Retrying
 * without those leading at-rules recovers the rest of the file, which is where
 * all of its rules are anyway.
 */
const locateBody = (
  css: string,
  code: string,
  claimed: readonly AssetRegion[],
): { region: AssetRegion; text: string; skippedLines: number } | null => {
  const whole = findUnclaimedRegion(css, code, claimed);
  if (whole != null) {
    return { region: whole, text: code, skippedLines: 0 };
  }

  const withoutAtRules = stripHoistedAtRules(code);
  // Nothing but hoisted at-rules leaves no body to search for, and an empty
  // needle matches at offset 0, which would claim the opening of the asset from
  // whichever stylesheet really starts it.
  if (withoutAtRules == null || withoutAtRules.text === "") {
    return null;
  }

  const region = findUnclaimedRegion(css, withoutAtRules.text, claimed);
  return region == null ? null : { region, ...withoutAtRules };
};

/**
 * Whether a stylesheet is nothing but the at-rules Vite hoists out of it, as a
 * barrel of webfont imports is. It has no body of its own in the asset, so it
 * is not one of the stylesheets an asset can be expected to contain.
 */
export const isEntirelyHoistedAtRules = (code: string): boolean =>
  stripHoistedAtRules(code.trim())?.text === "";

/**
 * Drops the `@charset` and `@import` statements a stylesheet opens with, or
 * returns null when it has none. CSS only permits them at the top of a file, so
 * they are always a prefix.
 */
const stripHoistedAtRules = (
  code: string,
): { text: string; skippedLines: number } | null => {
  let rest = code;
  let found = false;

  for (;;) {
    // Comments are skipped rather than stopped at, so that a licence banner
    // above the at-rules does not hide them. Whatever is skipped over is left
    // out of the body along with the at-rules themselves, since the asset no
    // longer holds it as one run either way.
    const trimmed = skipCommentsAndSpace(rest);
    if (!/^@(?:charset|import)\b/.test(trimmed)) {
      break;
    }
    const end = endOfStatement(trimmed);
    if (end === -1) {
      break;
    }
    rest = trimmed.slice(end);
    found = true;
  }

  if (!found) {
    return null;
  }

  const text = rest.trimStart();
  const consumed = code.length - text.length;
  return {
    text,
    skippedLines: code.slice(0, consumed).split("\n").length - 1,
  };
};

/**
 * Advances past the whitespace and comments CSS allows between the at-rules at
 * the top of a file. An unterminated comment runs to the end of the stylesheet,
 * so it is left in place: there is nothing beyond it to reach.
 */
const skipCommentsAndSpace = (code: string): string => {
  let rest = code.trimStart();

  while (rest.startsWith("/*")) {
    const end = rest.indexOf("*/", "/*".length);
    if (end === -1) {
      return rest;
    }
    rest = rest.slice(end + "*/".length).trimStart();
  }

  return rest;
};

/**
 * Offset just past the `;` that ends an at-rule statement, or -1 if it has no
 * such terminator.
 *
 * Scanning rather than searching for the first `;` because a URL can contain
 * one — `family=Inter:wght@400;700` is how Google Fonts asks for two weights,
 * and a data URI can hold any number of them.
 */
const endOfStatement = (code: string): number => {
  let quote: string | null = null;
  let depth = 0;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];

    if (quote != null) {
      if (char === "\\") {
        i++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth--;
    } else if (char === "{") {
      // A block at-rule such as `@media`, which Vite leaves where it is.
      return -1;
    } else if (char === ";" && depth === 0) {
      return i + 1;
    }
  }

  return -1;
};

/**
 * Finds the region of the asset a stylesheet occupies, ignoring regions another
 * stylesheet already occupies.
 *
 * Claiming whole regions rather than start offsets matters in both directions:
 * two stylesheets can compile to byte-identical CSS, and one stylesheet's CSS
 * can be a substring of another's. Either way the loser would otherwise be
 * unreachable through the map and its coverage attributed to the winner.
 */
const findUnclaimedRegion = (
  css: string,
  needle: string,
  claimed: readonly AssetRegion[],
): AssetRegion | null => {
  const pattern = buildNeedlePattern(needle);

  if (pattern == null) {
    let start = css.indexOf(needle);
    while (start !== -1) {
      const region = { start, end: start + needle.length };
      if (!overlapsClaimed(region, claimed)) {
        return region;
      }
      start = css.indexOf(needle, start + 1);
    }
    return null;
  }

  let match = pattern.exec(css);
  while (match != null) {
    const region = { start: match.index, end: match.index + match[0].length };
    if (!overlapsClaimed(region, claimed)) {
      return region;
    }
    pattern.lastIndex = match.index + 1;
    match = pattern.exec(css);
  }
  return null;
};

/**
 * Builds a pattern for a stylesheet whose CSS still contains asset
 * placeholders, or returns null when a plain substring search will do.
 *
 * A `url()` reference is a placeholder at the point this plugin captures the
 * stylesheet, and `vite:css-post` substitutes the real hashed URL afterwards.
 * Searching for the captured text verbatim would therefore never find a
 * stylesheet that references an image or font.
 */
const buildNeedlePattern = (needle: string): RegExp | null => {
  ASSET_PLACEHOLDER.lastIndex = 0;
  if (!ASSET_PLACEHOLDER.test(needle)) {
    return null;
  }

  const source = needle
    .split(ASSET_PLACEHOLDER)
    .map(escapeForRegExp)
    // A substituted URL never contains a quote, a closing paren, or a newline,
    // so this cannot run past the end of the `url()` it belongs to.
    .join(`[^"')\\n]*`);

  return new RegExp(source, "g");
};

const escapeForRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const overlapsClaimed = (
  region: AssetRegion,
  claimed: readonly AssetRegion[],
): boolean =>
  claimed.some((other) => region.start < other.end && other.start < region.end);
