declare const TSDOWN_WORKERD_SHIM_VERSION: string;

/**
 * npm package version of this shim, baked in at build time. Customers bump
 * `@alwaysmeticulous/backend-recorder-workerd` independently of our cloud
 * deploy, so this is the only way a replay can tell which bundled shim
 * produced its After screenshots.
 *
 * Replaced by tsdown's `define`. The guard keeps a direct source import
 * (vitest, typecheck) working, where no bundler has substituted the value.
 */
export const WORKERD_SHIM_VERSION: string =
  typeof TSDOWN_WORKERD_SHIM_VERSION !== "undefined"
    ? TSDOWN_WORKERD_SHIM_VERSION
    : "0.0.0-dev";
