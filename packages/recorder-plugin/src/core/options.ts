import type { Options, ResolvedOptions } from "../types";

const DEFAULT_SNIPPET_URL = "https://snippet.meticulous.ai/v1/meticulous.js";
const DEFAULT_PLACEHOLDER_ATTRIBUTE = "data-meticulous";

export const resolveOptions = (
  options: Options | undefined,
): ResolvedOptions => {
  const enabled = options?.enabled ?? "development";
  // Skip token validation when injection is permanently disabled so callers
  // can do `RecorderPlugin({ enabled: "never" })` without a dummy token.
  const tokenRequired = enabled !== "never";
  if (
    tokenRequired &&
    (!options ||
      typeof options.recordingToken !== "string" ||
      options.recordingToken.length === 0)
  ) {
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
    commitHash: resolveCommitHash(options?.commitHash),
    attributes,
  };
};

// Only explicit configuration is used. Hosting-provider build variables
// (VERCEL_GIT_COMMIT_SHA, Netlify COMMIT_REF, CF_PAGES_COMMIT_SHA,
// RENDER_GIT_COMMIT) name the commit that was built and could be inferred as
// a further fallback. Generic CI variables (GITHUB_SHA, GitLab CI_COMMIT_SHA,
// BITBUCKET_COMMIT) must not be: on pull request pipelines they name a
// temporary merge commit, or a commit other than the one built.
const resolveCommitHash = (
  commitHash: string | undefined,
): string | undefined => {
  const fromOption = commitHash?.trim();
  if (fromOption) {
    return fromOption;
  }
  const fromEnv = process.env.METICULOUS_APP_COMMIT_HASH?.trim();
  return fromEnv ? fromEnv : undefined;
};
