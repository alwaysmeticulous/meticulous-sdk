/**
 * Bun plugin entry.
 *
 * @example
 * ```ts
 * // bunfig.toml or programmatic Bun.build()
 * import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/bun";
 *
 * Bun.build({
 *   entrypoints: ["./src/index.ts"],
 *   plugins: [RecorderPlugin()],
 * });
 * ```
 */
import { createBunPlugin } from "unplugin";
import { unpluginFactory } from "./index";

export default createBunPlugin(unpluginFactory);
