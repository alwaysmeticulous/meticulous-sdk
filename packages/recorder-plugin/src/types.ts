export type EnabledMode = "development" | "always" | "never";

export interface EnabledContext {
  /** The bundler currently invoking the plugin. */
  framework: "vite" | "webpack" | "rspack";
  /**
   * Bundler-specific environment mode. For Vite this is the resolved Vite
   * `mode` (e.g. "development" / "production"). For webpack and Rspack this is
   * the configured `mode`. Falls back to `process.env.NODE_ENV` when nothing
   * else is available.
   */
  mode?: string;
  /** Vite-only: whether Vite is running in `serve` (dev/preview) or `build`. */
  command?: "serve" | "build";
  /** Best-effort detection of a production build. */
  isProduction: boolean;
}

export type EnabledOption =
  | EnabledMode
  | ((ctx: EnabledContext) => boolean);

export type ScriptAttributeValue = string | boolean | null | undefined;

export interface Options {
  /**
   * Required Meticulous recording token. Emitted as the
   * `data-recording-token` attribute on the injected `<script>`.
   */
  recordingToken: string;

  /**
   * Controls when the recorder script is injected into emitted HTML.
   *
   * - `"development"` (default): inject only during dev/preview builds — i.e.
   *   Vite `command === "serve"`, or webpack/rspack `mode !== "production"`.
   * - `"always"`: inject in every build, including production.
   * - `"never"`: disable the plugin entirely.
   * - `(ctx) => boolean`: custom predicate, called once per build with the
   *   resolved {@link EnabledContext}.
   *
   * @default "development"
   */
  enabled?: EnabledOption;

  /**
   * How to inject the script.
   *
   * - `"auto"` (default): prepend a new `<script>` as the first child of the
   *   `<head>` element.
   * - `"replace"`: replace a placeholder script tag the user has manually
   *   added to their HTML (e.g. `<script data-meticulous></script>`). The
   *   placeholder is matched by the attribute named in
   *   {@link Options.placeholderAttribute}. If no placeholder is found the
   *   plugin falls back to `"auto"` behaviour and emits a warning.
   *
   * @default "auto"
   */
  inject?: "auto" | "replace";

  /**
   * Attribute name used to locate the placeholder script tag when
   * `inject === "replace"`.
   *
   * @default "data-meticulous"
   */
  placeholderAttribute?: string;

  /**
   * Override the snippet URL.
   *
   * @default "https://snippet.meticulous.ai/v1/meticulous.js"
   */
  snippetUrl?: string;

  /**
   * Extra attributes to add to the injected `<script>` tag, e.g. `nonce` or
   * `data-is-production-environment`. String values are emitted verbatim
   * (escaped). `true` emits a boolean attribute (no value). `false`, `null`,
   * and `undefined` skip the attribute.
   */
  attributes?: Record<string, ScriptAttributeValue>;
}

export interface ResolvedOptions {
  recordingToken: string;
  enabled: EnabledOption;
  inject: "auto" | "replace";
  placeholderAttribute: string;
  snippetUrl: string;
  attributes: Record<string, ScriptAttributeValue>;
}
