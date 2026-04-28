/**
 * Farm plugin entry.
 *
 * @example
 * ```ts
 * // farm.config.ts
 * import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/farm";
 *
 * export default {
 *   plugins: [RecorderPlugin()],
 * };
 * ```
 */
import { createFarmPlugin } from "unplugin";
import { unpluginFactory } from "./index";

export default createFarmPlugin(unpluginFactory);
