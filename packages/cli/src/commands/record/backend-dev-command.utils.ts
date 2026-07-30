/**
 * Pure helpers for `meticulous record backend`: extracting the passthrough
 * dev command from raw argv and injecting the sidecar URL into recognized
 * wrangler invocations.
 */

/**
 * Returns the tokens after the first standalone `--` in the given argv, or
 * null when there is no `--` (or nothing follows it). Reads raw argv rather
 * than yargs' parsed positionals so passthrough flags (e.g. `--port` meant
 * for wrangler) and numeric-looking tokens survive untouched.
 */
export const extractPassthroughCommand = (argv: string[]): string[] | null => {
  const separatorIndex = argv.indexOf("--");
  if (separatorIndex === -1) {
    return null;
  }
  const passthrough = argv.slice(separatorIndex + 1);
  return passthrough.length > 0 ? passthrough : null;
};

export type DevCommandKind = "wrangler-dev" | "wrangler-pages-dev" | "unknown";

/** Package-runner prefixes to skip when looking for the real binary. */
const RUNNERS = new Set(["npx", "bunx", "yarn"]);
const PNPM_SUBCOMMANDS = new Set(["exec", "dlx", "run"]);
const RUNNER_FLAGS = new Set(["-y", "--yes", "-q", "--quiet", "--silent"]);

const isWranglerToken = (token: string): boolean =>
  token === "wrangler" ||
  token.endsWith("/wrangler") ||
  token.endsWith("/wrangler.cmd") ||
  token === "wrangler.cmd";

/**
 * Classifies a passthrough dev command so the sidecar URL can be injected
 * with the right wrangler flag. Only positively-recognized invocations are
 * classified — anything else (npm scripts, custom wrappers) is "unknown" and
 * gets printed instructions instead of argv surgery.
 */
export const classifyDevCommand = (tokens: string[]): DevCommandKind => {
  let index = 0;
  // Skip package runners and their common flags: `npx [-y] wrangler ...`,
  // `pnpm [exec|dlx] wrangler ...`, `yarn wrangler ...`, `bunx wrangler ...`.
  if (index < tokens.length) {
    const first = tokens[index];
    if (RUNNERS.has(first)) {
      index++;
    } else if (first === "pnpm") {
      index++;
      if (index < tokens.length && PNPM_SUBCOMMANDS.has(tokens[index])) {
        index++;
      }
    }
    while (index < tokens.length && RUNNER_FLAGS.has(tokens[index])) {
      index++;
    }
  }

  if (index >= tokens.length || !isWranglerToken(tokens[index])) {
    return "unknown";
  }
  index++;

  if (tokens[index] === "dev") {
    return "wrangler-dev";
  }
  if (tokens[index] === "pages" && tokens[index + 1] === "dev") {
    return "wrangler-pages-dev";
  }
  return "unknown";
};

export const SIDECAR_URL_VAR_NAME = "METICULOUS_SIDECAR_URL";

/**
 * Appends the flag that exposes the sidecar URL to the worker as a var:
 * `wrangler dev` takes `--var KEY:VALUE`, `wrangler pages dev` takes
 * `--binding KEY=VALUE`. Unknown commands are returned unchanged — the
 * caller prints manual instructions instead.
 */
export const injectSidecarVar = (
  tokens: string[],
  kind: DevCommandKind,
  sidecarUrl: string,
): string[] => {
  switch (kind) {
    case "wrangler-dev":
      return [...tokens, "--var", `${SIDECAR_URL_VAR_NAME}:${sidecarUrl}`];
    case "wrangler-pages-dev":
      return [...tokens, "--binding", `${SIDECAR_URL_VAR_NAME}=${sidecarUrl}`];
    case "unknown":
      return tokens;
  }
};
