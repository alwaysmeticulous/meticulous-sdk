/**
 * Webpack plugin entry.
 *
 * @example
 * ```js
 * // webpack.config.mjs
 * import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/webpack";
 *
 * export default {
 *   plugins: [RecorderPlugin({ recordingToken: "<your-token>" })],
 * };
 * ```
 */
import { createWebpackPlugin } from "unplugin";
import { unpluginFactory } from "./index";

export default createWebpackPlugin(unpluginFactory);
