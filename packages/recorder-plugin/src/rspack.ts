/**
 * Rspack plugin entry.
 *
 * @example
 * ```js
 * // rspack.config.mjs
 * import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/rspack";
 *
 * export default {
 *   plugins: [RecorderPlugin()],
 * };
 * ```
 */
import { createRspackPlugin } from "unplugin";
import { unpluginFactory } from "./index";

export default createRspackPlugin(unpluginFactory);
