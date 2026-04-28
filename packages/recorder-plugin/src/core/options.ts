import type { Options, ResolvedOptions } from "../types";

const DEFAULT_SNIPPET_URL = "https://snippet.meticulous.ai/v1/meticulous.js";
const DEFAULT_PLACEHOLDER_ATTRIBUTE = "data-meticulous";

export const resolveOptions = (options: Options | undefined): ResolvedOptions => {
  if (!options || typeof options.recordingToken !== "string" || options.recordingToken.length === 0) {
    throw new Error(
      "@alwaysmeticulous/recorder-plugin: `recordingToken` is required. Pass it when constructing the plugin, e.g. `RecorderPlugin({ recordingToken: '...' })`.",
    );
  }

  return {
    recordingToken: options.recordingToken,
    enabled: options.enabled ?? "development",
    inject: options.inject ?? "auto",
    placeholderAttribute:
      options.placeholderAttribute ?? DEFAULT_PLACEHOLDER_ATTRIBUTE,
    snippetUrl: options.snippetUrl ?? DEFAULT_SNIPPET_URL,
    attributes: options.attributes ?? {},
  };
};
