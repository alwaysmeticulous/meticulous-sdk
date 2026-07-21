import type { AssetUploadMetadata } from "@alwaysmeticulous/api";
import { initLogger } from "@alwaysmeticulous/common";

const REGEX_INDICATORS: { pattern: RegExp; label: string }[] = [
  {
    pattern: /\(\.[*+?]/,
    label: "capture group with quantifier, e.g. (.*)",
  },
  {
    pattern: /\(\?[:=!<]/,
    label: "non-capturing group or lookahead/lookbehind",
  },
  { pattern: /\\/, label: "backslash escape" },
  { pattern: /(^|\/)\.\*/, label: "regex wildcard .*" },
  { pattern: /(^|\/)\.\+/, label: "regex quantifier .+" },
  { pattern: /\$$/, label: "end-of-string anchor $" },
  { pattern: /^\^/, label: "start-of-string anchor ^" },
];

const looksLikeRegex = (source: string): string | null => {
  for (const { pattern, label } of REGEX_INDICATORS) {
    if (pattern.test(source)) {
      return label;
    }
  }
  return null;
};

export const warnIfRewriteSourcesLookLikeRegexes = (
  rewrites: AssetUploadMetadata["rewrites"],
): void => {
  const suspects = rewrites
    .map((rule) => ({
      source: rule.source,
      reason: looksLikeRegex(rule.source),
    }))
    .filter(
      (entry): entry is { source: string; reason: string } =>
        entry.reason != null,
    );

  if (suspects.length === 0) {
    return;
  }

  const logger = initLogger();
  logger.warn(
    "One or more --rewrites source patterns look like regular expressions, " +
      "but rewrite sources use glob syntax (see https://github.com/vercel/serve-handler?tab=readme-ov-file#rewrites-array). " +
      "Regex patterns will not match as expected.",
  );
  for (const { source, reason } of suspects) {
    logger.warn(`  - "${source}" looks like a regex (${reason})`);
  }
};
