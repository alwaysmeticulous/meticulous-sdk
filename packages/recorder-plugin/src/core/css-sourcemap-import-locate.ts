/**
 * Places named preprocessor imports inside one compiled stylesheet.
 *
 * Tailwind's transform map lists every `@import` and ships `sourcesContent`,
 * but only maps a handful of generated positions. The imported files are still
 * in the compiled CSS — Lightning has just reformatted them — so their
 * selectors can be found and attributed. Tailwind utilities have no such
 * selector and stay on the entry stylesheet.
 */

export interface ImportSource {
  absolutePath: string;
  content: string;
}

export interface LocatedImportRule {
  absolutePath: string;
  content: string;
  /** 0-based line of the selector in the import. */
  originalLine: number;
  /** Inclusive 0-based line range in the compiled stylesheet. */
  startLine: number;
  endLine: number;
}

/** Shorter than this is too likely to be a Tailwind utility or a tag name. */
const MIN_SELECTOR_LENGTH = 10;

const GENERIC_SELECTORS = new Set([
  "*",
  ":root",
  "html",
  "body",
  "a",
  "p",
  "img",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

const WRAPPER_AT_RULE = /^@(?:media|supports|layer|container|scope)\b/i;

export const locateImportRules = (
  generated: string,
  imports: readonly ImportSource[],
): LocatedImportRule[] => {
  if (generated === "" || imports.length === 0) {
    return [];
  }

  const collapsed = collapseWhitespace(generated);
  const claimed: Interval[] = [];
  const located: LocatedImportRule[] = [];

  for (const imported of imports) {
    for (const rule of parseStyleRules(imported.content)) {
      const selector = normalizeWhitespace(rule.selector);
      if (!isLocatableSelector(selector)) {
        continue;
      }

      const match = findUnclaimed(collapsed, generated, selector, claimed);
      if (match == null) {
        continue;
      }
      claimed.push(match);
      claimed.sort((a, b) => a.start - b.start);

      located.push({
        absolutePath: imported.absolutePath,
        content: imported.content,
        originalLine: rule.line,
        startLine: lineAt(generated, match.start),
        endLine: lineAt(generated, Math.max(match.start, match.end - 1)),
      });
    }
  }

  return located;
};

export const parseStyleRules = (
  css: string,
): { selector: string; line: number }[] => {
  const rules: { selector: string; line: number }[] = [];

  const walk = (from: number, to: number) => {
    let i = skipTrivia(css, from);
    while (i < to) {
      const start = i;
      const scanned = scanPrelude(css, i, to);
      if (scanned.kind === "eof") {
        return;
      }
      if (scanned.kind === ";") {
        i = skipTrivia(css, scanned.index + 1);
        continue;
      }

      const open = scanned.index;
      const close = matchingBrace(css, open, to);
      const prelude = css.slice(start, open).trim();
      if (WRAPPER_AT_RULE.test(prelude)) {
        walk(open + 1, close);
      } else if (!prelude.startsWith("@")) {
        rules.push({ selector: prelude, line: lineAt(css, start) });
      }
      i = skipTrivia(css, close + 1);
    }
  };

  walk(0, css.length);
  return rules;
};

const isLocatableSelector = (selector: string): boolean =>
  selector.length >= MIN_SELECTOR_LENGTH && !GENERIC_SELECTORS.has(selector);

interface Interval {
  start: number;
  end: number;
}

const findUnclaimed = (
  collapsed: Collapsed,
  generated: string,
  selector: string,
  claimed: readonly Interval[],
): Interval | null => {
  const needle = collapseWhitespace(selector).text;
  if (needle === "") {
    return null;
  }

  let from = 0;
  while (from < collapsed.text.length) {
    const at = collapsed.text.indexOf(needle, from);
    if (at === -1) {
      return null;
    }
    const start = collapsed.toOrig[at];
    if (start == null) {
      return null;
    }
    const afterSelector = start + selectorSpan(generated, start, selector);
    const open = openingBraceAfterSelector(generated, start, afterSelector);
    if (open === -1) {
      from = at + needle.length;
      continue;
    }
    const close = matchingBrace(generated, open, generated.length);
    const end = Math.min(generated.length, close + 1);
    if (!overlaps({ start, end }, claimed)) {
      return { start, end };
    }
    from = at + needle.length;
  }
  return null;
};

/**
 * How far the generated selector runs from `start`. Flexible whitespace means
 * this can differ from `selector.length`.
 */
const selectorSpan = (
  generated: string,
  start: number,
  selector: string,
): number => {
  const target = normalizeWhitespace(selector);
  let i = start;
  let seen = "";
  while (i < generated.length) {
    const char = generated[i];
    if (char == null) {
      break;
    }
    if (/\s/.test(char)) {
      if (seen.length > 0 && !seen.endsWith(" ")) {
        seen += " ";
      }
      i++;
      continue;
    }
    seen += char;
    i++;
    if (seen === target) {
      return i - start;
    }
    if (!target.startsWith(seen)) {
      return selector.length;
    }
  }
  return i - start;
};

/**
 * A match is a real rule only when it is a whole selector — not a prefix of a
 * longer class, not a mention in a comment — and `{` is the next token.
 */
const openingBraceAfterSelector = (
  generated: string,
  start: number,
  afterSelector: number,
): number => {
  if (isInsideCommentOrString(generated, start)) {
    return -1;
  }
  const before = start === 0 ? "" : (generated[start - 1] ?? "");
  if (before !== "" && isIdentContinue(before)) {
    return -1;
  }
  const after = generated[afterSelector] ?? "";
  if (after !== "" && isIdentContinue(after)) {
    return -1;
  }
  const open = skipTrivia(generated, afterSelector);
  return generated[open] === "{" ? open : -1;
};

const isIdentContinue = (char: string): boolean =>
  /[A-Za-z0-9_-]/.test(char) || char.charCodeAt(0) > 127;

const isInsideCommentOrString = (css: string, offset: number): boolean => {
  let quote: string | null = null;
  let i = 0;
  while (i < offset) {
    const char = css[i];
    if (char == null) {
      break;
    }
    if (quote != null) {
      if (char === "\\") {
        i += 2;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      i++;
      continue;
    }
    if (char === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1 || end + 2 > offset) {
        return true;
      }
      i = end + 2;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    }
    i++;
  }
  return quote != null;
};

const overlaps = (
  interval: Interval,
  claimed: readonly Interval[],
): boolean => {
  for (const other of claimed) {
    if (interval.start < other.end && other.start < interval.end) {
      return true;
    }
  }
  return false;
};

interface Collapsed {
  text: string;
  toOrig: number[];
}

const collapseWhitespace = (value: string): Collapsed => {
  const chars: string[] = [];
  const toOrig: number[] = [];
  let pendingSpace = false;
  let started = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char == null) {
      continue;
    }
    if (/\s/.test(char)) {
      if (started) {
        pendingSpace = true;
      }
      continue;
    }
    if (pendingSpace) {
      chars.push(" ");
      toOrig.push(i);
      pendingSpace = false;
    }
    chars.push(char);
    toOrig.push(i);
    started = true;
  }
  return { text: chars.join(""), toOrig };
};

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const lineAt = (css: string, offset: number): number => {
  let lines = 0;
  const end = Math.min(offset, css.length);
  for (let i = 0; i < end; i++) {
    if (css[i] === "\n") {
      lines++;
    }
  }
  return lines;
};

const skipTrivia = (css: string, index: number): number => {
  let i = index;
  while (i < css.length) {
    const char = css[i];
    if (
      char === " " ||
      char === "\t" ||
      char === "\n" ||
      char === "\r" ||
      char === "\f"
    ) {
      i++;
      continue;
    }
    if (char === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    break;
  }
  return i;
};

const scanPrelude = (
  css: string,
  from: number,
  to: number,
): { kind: "{" | ";" | "eof"; index: number } => {
  let quote: string | null = null;
  let paren = 0;
  for (let i = from; i < to; i++) {
    const char = css[i];
    if (char == null) {
      break;
    }
    if (quote != null) {
      if (char === "\\") {
        i++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? to : end + 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") {
      paren++;
      continue;
    }
    if (char === ")") {
      paren--;
      continue;
    }
    if (paren === 0 && char === "{") {
      return { kind: "{", index: i };
    }
    if (paren === 0 && char === ";") {
      return { kind: ";", index: i };
    }
  }
  return { kind: "eof", index: to };
};

const matchingBrace = (css: string, open: number, to: number): number => {
  let depth = 1;
  let quote: string | null = null;
  for (let i = open + 1; i < to; i++) {
    const char = css[i];
    if (char == null) {
      break;
    }
    if (quote != null) {
      if (char === "\\") {
        i++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? to : end + 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return to;
};
