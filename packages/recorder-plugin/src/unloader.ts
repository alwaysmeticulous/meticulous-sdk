/**
 * Unloader plugin entry.
 *
 * @example
 * ```ts
 * // unloader.config.ts
 * import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/unloader";
 *
 * export default {
 *   plugins: [RecorderPlugin()],
 * };
 * ```
 */
import { createUnloaderPlugin } from "unplugin";
import { unpluginFactory } from "./index";

export default createUnloaderPlugin(unpluginFactory);
