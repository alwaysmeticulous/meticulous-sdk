/**
 * Vite plugin entry.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/vite";
 *
 * export default defineConfig({
 *   plugins: [RecorderPlugin()],
 * });
 * ```
 */
import { createVitePlugin } from "unplugin";
import { unpluginFactory } from "./index";

export default createVitePlugin(unpluginFactory);
