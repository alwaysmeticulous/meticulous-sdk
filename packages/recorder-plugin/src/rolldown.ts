/**
 * Rolldown plugin entry.
 *
 * @example
 * ```ts
 * // rolldown.config.ts
 * import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/rolldown";
 *
 * export default {
 *   plugins: [RecorderPlugin()],
 * };
 * ```
 */
import { createRolldownPlugin } from "unplugin";
import { unpluginFactory } from "./index";

export default createRolldownPlugin(unpluginFactory);
