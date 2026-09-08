# @alwaysmeticulous/recorder-plugin

A bundler plugin that injects the [Meticulous recorder](https://app.meticulous.ai/docs/how-to/recorder-script)
script into the `<head>` of your app's HTML, with one entry point per
supported bundler/framework.

By default, the recorder is only injected during development builds —
matching Meticulous's recommendation to record real sessions in staging or
production via an explicit opt-in.

> Built on top of [`unplugin@3`](https://github.com/unjs/unplugin) and
> [`tsdown`](https://tsdown.dev/). ESM-only. Requires Node.js 20.19+.

## Installing

```shell
npm install @alwaysmeticulous/recorder-plugin --save-dev
# or with yarn
yarn add -D @alwaysmeticulous/recorder-plugin
# or with pnpm
pnpm add -D @alwaysmeticulous/recorder-plugin
```

## Usage

<details open>
<summary>Vite</summary>

```ts
// vite.config.ts
import meticulous from "@alwaysmeticulous/recorder-plugin/vite";

export default defineConfig({
  plugins: [
    meticulous({
      recordingToken: "<your-recording-token>",
    }),
  ],
});
```

</details>

<details>
<summary>Webpack</summary>

```js
// webpack.config.mjs
import meticulous from "@alwaysmeticulous/recorder-plugin/webpack";

export default {
  plugins: [meticulous({ recordingToken: "<your-recording-token>" })],
};
```

The plugin integrates with
[`html-webpack-plugin`](https://github.com/jantimon/html-webpack-plugin) when
present, and otherwise falls back to rewriting any emitted `.html` assets.

</details>

<details>
<summary>Rspack</summary>

```js
// rspack.config.mjs
import meticulous from "@alwaysmeticulous/recorder-plugin/rspack";

export default {
  plugins: [meticulous({ recordingToken: "<your-recording-token>" })],
};
```

</details>

<details>
<summary>Rsbuild</summary>

Prefer the dedicated Rsbuild entry, which hooks into Rsbuild's `modifyHTML` API:

```ts
// rsbuild.config.ts
import { defineConfig } from "@rsbuild/core";
import meticulous from "@alwaysmeticulous/recorder-plugin/rsbuild";

export default defineConfig({
  plugins: [meticulous({ recordingToken: "<your-recording-token>" })],
});
```

You can also pass the rspack plugin through `tools.rspack` if you need to
compose it with other rspack-only plugins:

```ts
// rsbuild.config.ts
import { defineConfig } from "@rsbuild/core";
import meticulous from "@alwaysmeticulous/recorder-plugin/rspack";

export default defineConfig({
  tools: {
    rspack: {
      plugins: [meticulous({ recordingToken: "<your-recording-token>" })],
    },
  },
});
```

</details>

<details>
<summary>Nuxt</summary>

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    [
      "@alwaysmeticulous/recorder-plugin/nuxt",
      { recordingToken: "<your-recording-token>" },
    ],
  ],
});
```

The Nuxt module injects the recorder script via `nuxt.options.app.head.script`,
which feeds into Nitro's render pipeline and works correctly regardless of
which bundler Nuxt is using.

</details>

## Options

```ts
import type { Options } from "@alwaysmeticulous/recorder-plugin";
```

| Option                 | Type                                                       | Default                                            | Description                                                                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recordingToken`       | `string` (required)                                        | —                                                  | Your Meticulous recording token. Emitted as `data-recording-token` on the injected `<script>`.                                                                                                            |
| `enabled`              | `"development" \| "always" \| "never" \| (ctx) => boolean` | `"development"`                                    | When to inject. `"development"` only injects during development builds (Vite `command === "serve"` or webpack/rspack `mode !== "production"`). Pass a function for full control.                          |
| `inject`               | `"auto" \| "replace"`                                      | `"auto"`                                           | `"auto"` prepends a new `<script>` as the first child of `<head>`. `"replace"` swaps a placeholder script tag (see below).                                                                                |
| `placeholderAttribute` | `string`                                                   | `"data-meticulous"`                                | Attribute name used to find the placeholder when `inject: "replace"`.                                                                                                                                     |
| `snippetUrl`           | `string`                                                   | `"https://snippet.meticulous.ai/v1/meticulous.js"` | Override the snippet URL.                                                                                                                                                                                 |
| `attributes`           | `Record<string, string \| boolean \| null \| undefined>`   | `{}`                                               | Extra attributes on the `<script>` tag (e.g. `nonce`). `true` emits a boolean attribute; `false`/`null`/`undefined` skip it. Overrides any default attribute, including `data-is-production-environment`. |

The plugin always emits `data-is-production-environment="true"` or
`data-is-production-environment="false"` on the injected `<script>` based on
the bundler's detected mode (Vite `command === "build" && mode === "production"`,
webpack/rspack `mode === "production"`). Override it via `attributes` if you
need different behaviour:

```ts
meticulous({
  recordingToken: "<your-recording-token>",
  attributes: {
    "data-is-production-environment":
      process.env.MY_ENV === "prod" ? "true" : "false",
  },
});
```

### Controlling when the recorder loads

```ts
meticulous({
  recordingToken: "<your-recording-token>",
  // Always inject — useful in staging.
  enabled: "always",
});

meticulous({
  recordingToken: "<your-recording-token>",
  // Custom predicate.
  enabled: (ctx) => ctx.framework === "vite" && ctx.mode !== "test",
});
```

The predicate receives an `EnabledContext`:

```ts
interface EnabledContext {
  framework: "vite" | "webpack" | "rspack";
  mode?: string; // Vite mode / webpack mode / NODE_ENV fallback
  command?: "serve" | "build"; // Vite-only
  isProduction: boolean;
}
```

### Replacing a manually-added placeholder

If you'd rather control where the script lives in your `index.html`, add a
placeholder and switch `inject` to `"replace"`:

```html
<!-- index.html -->
<head>
  <script data-meticulous></script>
  <!-- ... -->
</head>
```

```ts
meticulous({
  recordingToken: "<your-recording-token>",
  inject: "replace",
  // placeholderAttribute defaults to "data-meticulous"
});
```

If the placeholder is not found, the plugin falls back to `"auto"` injection
and emits a build warning.

## CSS source maps (Vite)

Meticulous reports which of your stylesheets each test covered. To do that it
needs to map the bundled CSS the browser loaded back to the stylesheets in your
repository, which requires a CSS source map. Vite does not emit one for
production builds ([vitejs/vite#2830](https://github.com/vitejs/vite/issues/2830)),
so without this plugin a bundled stylesheet is opaque and its coverage cannot be
attributed to any file.

```ts
// vite.config.ts
import CssSourcemapPlugin from "@alwaysmeticulous/recorder-plugin/css-sourcemap";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [CssSourcemapPlugin()],
});
```

This emits a `<asset>.css.map` next to each CSS asset and references it from the
asset, alongside whatever JavaScript source maps you already produce.

Every stylesheet in the bundle is attributed to the file it came from, whether
that is plain CSS, a CSS module, Sass/SCSS, Less, or Tailwind. How precise that
attribution is within a file depends on the stylesheet. CSS that reaches the
bundle unchanged maps line for line. Anything a preprocessor rewrote maps
approximately, because Vite discards preprocessor source maps in production
builds. Tailwind `@import`s keep line-level maps: the plugin reads the
transform map `@tailwindcss/vite` already builds (Vite's combiner would
otherwise drop it). Generated utilities still attribute to the Tailwind entry
or `tailwindcss/index.css`, not to the `className` that produced them.

> [!IMPORTANT]
> The plugin disables Vite's CSS minification, which is what makes the emitted
> maps accurate — Vite minifies a CSS asset after the plugin has recorded where
> each stylesheet landed inside it. Enable the plugin on the build whose
> coverage Meticulous collects rather than on every production build. If you
> keep minification on via `disableCssMinify: false`, the plugin emits no map at
> all and warns, rather than emitting a partial one that would attribute some
> stylesheets' rules to their neighbours.

### Options

```ts
import type { CssSourcemapOptions } from "@alwaysmeticulous/recorder-plugin/css-sourcemap";
```

| Option             | Type      | Default       | Description                                                                                                                               |
| ------------------ | --------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | `boolean` | `true`        | Whether to generate CSS source maps.                                                                                                      |
| `root`             | `string`  | the Vite root | Directory that emitted source paths are made relative to. Set this to your repository root when the Vite project lives in a subdirectory. |
| `disableCssMinify` | `boolean` | `true`        | Disable Vite's CSS minification while the plugin is active.                                                                               |

In a monorepo where the Vite project is not the repository root, point `root` at
the repository so the emitted paths match the ones Meticulous sees:

```ts
CssSourcemapPlugin({ root: path.resolve(__dirname, "../..") });
```
