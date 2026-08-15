declare const TSDOWN_METICULOUS_COMMIT_HASH: string;

/**
 * Commit the sidecar was last changed in, recorded onto every session's `metadata.json` as
 * `recorderVersion`, so a recording can be traced back to the sidecar that produced it — which
 * matters most when a customer's deployed sidecar is older than the shim reporting to it.
 *
 * Replaced at build time by tsdown's `define`, matching how the Node recorder resolves the same
 * field. The guard keeps a direct source import (vitest, typecheck) working, where no bundler has
 * substituted the value.
 */
export const METICULOUS_COMMIT_HASH: string =
  typeof TSDOWN_METICULOUS_COMMIT_HASH !== "undefined"
    ? TSDOWN_METICULOUS_COMMIT_HASH
    : "unknown";
