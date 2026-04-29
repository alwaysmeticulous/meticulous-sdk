import type { Options, ResolvedOptions } from "../types";

const DEFAULT_SNIPPET_URL = "https://snippet.meticulous.ai/v1/meticulous.js";
const DEFAULT_PLACEHOLDER_ATTRIBUTE = "data-meticulous";

export const resolveOptions = (options: Options | undefined): ResolvedOptions => {
  const enabled = options?.enabled ?? "development";
  // Skip token validation when injection is permanently disabled so callers
  // can do `RecorderPlugin({ enabled: "never" })` without a dummy token.
  const tokenRequired = enabled !== "never";
  if (tokenRequired && (!options || typeof options.recordingToken !== "string" || options.recordingToken.length === 0)) {
    throw new Error(
      "@alwaysmeticulous/recorder-plugin: `recordingToken` is required. Pass it when constructing the plugin, e.g. `RecorderPlugin({ recordingToken: '...' })`.",
    );
  }

  const attributes = options?.attributes ?? {};
  for (const forbidden of ["async", "defer"] as const) {
    if (forbidden in attributes && attributes[forbidden]) {
      console.warn(
        `@alwaysmeticulous/recorder-plugin: \`attributes.${forbidden}\` is not allowed on the recorder script and will prevent network calls from being captured. Remove it from the \`attributes\` option.`,
      );
    }
  }

  return {
    recordingToken: options?.recordingToken ?? "",
    enabled,
    inject: options?.inject ?? "auto",
    placeholderAttribute:
      options?.placeholderAttribute ?? DEFAULT_PLACEHOLDER_ATTRIBUTE,
    snippetUrl: options?.snippetUrl ?? DEFAULT_SNIPPET_URL,
    attributes,
  };
};
