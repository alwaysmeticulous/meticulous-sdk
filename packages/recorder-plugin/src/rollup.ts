/**
 * Rollup plugin entry.
 *
 * @example
 * ```ts
 * // rollup.config.js
 * import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/rollup";
 *
 * export default {
 *   plugins: [RecorderPlugin()],
 * };
 * ```
 */
import { createRollupPlugin } from "unplugin";
import { unpluginFactory } from "./index";

export default createRollupPlugin(unpluginFactory);
