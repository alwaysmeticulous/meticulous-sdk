import type { FilterPattern } from "unplugin";

export interface Options {
  /**
   * Modules to apply the transform to. Accepts the standard unplugin/Rollup
   * filter patterns (string globs, RegExp, or arrays of them).
   *
   * @default [/\.[cm]?[jt]sx?$/]
   */
  include?: FilterPattern;
  /**
   * Modules to exclude from the transform.
   *
   * @default [/node_modules/]
   */
  exclude?: FilterPattern;
  /**
   * Controls when the plugin runs relative to other plugins.
   *
   * @default "pre"
   */
  enforce?: "pre" | "post" | undefined;
}

export type ResolvedOptions = Required<Pick<Options, "include" | "exclude">> & {
  enforce: Options["enforce"];
};
