export interface InjectResult {
  html: string;
  warning?: string;
  injected: boolean;
}

const escapeForRegex = (value: string): string =>
  value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

const buildPlaceholderRegex = (placeholderAttribute: string): RegExp =>
  new RegExp(
    `<script\\b[^>]*\\b${escapeForRegex(placeholderAttribute)}\\b[^>]*>\\s*<\\/script>`,
    "i",
  );

const HEAD_OPEN_REGEX = /<head\b[^>]*>/i;

const replacePlaceholder = (
  html: string,
  scriptTag: string,
  placeholderAttribute: string,
): { matched: boolean; html: string } => {
  const regex = buildPlaceholderRegex(placeholderAttribute);
  if (!regex.test(html)) {
    return { matched: false, html };
  }
  return { matched: true, html: html.replace(regex, scriptTag) };
};

const insertAfterHead = (
  html: string,
  scriptTag: string,
): { matched: boolean; html: string } => {
  const match = html.match(HEAD_OPEN_REGEX);
  if (!match || match.index === undefined) {
    return { matched: false, html };
  }
  const insertAt = match.index + match[0].length;
  return {
    matched: true,
    html: html.slice(0, insertAt) + scriptTag + html.slice(insertAt),
  };
};

/**
 * Inject the recorder `<script>` tag into the provided HTML.
 *
 * @param html - The full HTML document.
 * @param scriptTag - The fully-formed script tag to inject.
 * @param mode - "auto" prepends the tag inside `<head>`. "replace" swaps the
 *   user-provided placeholder script tag (matched by `placeholderAttribute`),
 *   falling back to "auto" with a warning if the placeholder is missing.
 * @param placeholderAttribute - Attribute name used to locate the placeholder
 *   when `mode === "replace"`.
 */
export const injectIntoHtml = (
  html: string,
  scriptTag: string,
  mode: "auto" | "replace",
  placeholderAttribute: string,
): InjectResult => {
  if (mode === "replace") {
    const replaced = replacePlaceholder(html, scriptTag, placeholderAttribute);
    if (replaced.matched) {
      return { html: replaced.html, injected: true };
    }
    const fallback = insertAfterHead(html, scriptTag);
    if (fallback.matched) {
      return {
        html: fallback.html,
        injected: true,
        warning: `Could not find a placeholder script tag with attribute \`${placeholderAttribute}\`; injected the recorder script as the first child of <head> instead.`,
      };
    }
    return {
      html,
      injected: false,
      warning: `Could not find a placeholder script tag with attribute \`${placeholderAttribute}\` and no <head> element was found; the Meticulous recorder script was not injected.`,
    };
  }

  const inserted = insertAfterHead(html, scriptTag);
  if (inserted.matched) {
    return { html: inserted.html, injected: true };
  }
  return {
    html,
    injected: false,
    warning:
      "Could not find a <head> element; the Meticulous recorder script was not injected.",
  };
};
