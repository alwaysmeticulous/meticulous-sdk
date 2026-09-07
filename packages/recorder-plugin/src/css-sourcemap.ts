/**
 * Vite plugin that emits CSS source maps, so that Meticulous can attribute
 * stylesheet coverage back to the stylesheets in your repository.
 *
 * Vite does not emit CSS source maps for production builds, so enable this on
 * the build whose coverage Meticulous collects. It disables CSS minification,
 * which is what makes the emitted maps accurate.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import CssSourcemapPlugin from "@alwaysmeticulous/recorder-plugin/css-sourcemap";
 *
 * export default defineConfig({
 *   plugins: [CssSourcemapPlugin()],
 * });
 * ```
 */
import { cssSourcemapPlugin } from "./core/css-sourcemap";

export default cssSourcemapPlugin;
export { cssSourcemapPlugin };
export type { CssSourcemapOptions } from "./core/css-sourcemap";
