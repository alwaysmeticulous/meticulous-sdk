import type { Options, ResolvedOptions } from "../types";

export const resolveOptions = (options: Options): ResolvedOptions => ({
  include: options.include ?? [/\.[cm]?[jt]sx?$/],
  exclude: options.exclude ?? [/node_modules/],
  enforce: "enforce" in options ? options.enforce : "pre",
});
