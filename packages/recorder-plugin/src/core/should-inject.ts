import type { EnabledContext, EnabledOption } from "../types";

/**
 * Decide whether the recorder script should be injected for a given build,
 * based on the user's `enabled` option and the resolved {@link EnabledContext}.
 */
export const shouldInject = (
  enabled: EnabledOption,
  ctx: EnabledContext,
): boolean => {
  if (typeof enabled === "function") {
    return enabled(ctx) === true;
  }
  switch (enabled) {
    case "always":
      return true;
    case "never":
      return false;
    case "development":
      return !ctx.isProduction;
  }
};
