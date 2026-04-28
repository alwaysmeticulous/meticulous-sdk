/**
 * esbuild plugin entry.
 *
 * @example
 * ```ts
 * import { build } from "esbuild";
 * import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/esbuild";
 *
 * build({
 *   plugins: [RecorderPlugin()],
 * });
 * ```
 */
import { createEsbuildPlugin } from "unplugin";
import { unpluginFactory } from "./index";

export default createEsbuildPlugin(unpluginFactory);
