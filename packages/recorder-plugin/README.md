# @alwaysmeticulous/recorder-plugin

A bundler plugin that injects the [Meticulous recorder](https://app.meticulous.ai/docs/how-to/recorder-script)
script into the `<head>` of your app's HTML, with one entry point per
supported bundler/framework.

By default, the recorder is only injected during development/preview builds —
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
  plugins: [
    meticulous({ recordingToken: "<your-recording-token>" }),
  ],
};
```

The plugin integrates with
[`html-webpack-plugin`](https://github.com/jantimon/html-webpack-plugin) when
present, and otherwise falls back to rewriting any emitted `.html` assets.

</details>

<details>
<summary>Rspack (and rsbuild)</summary>

```js
// rspack.config.mjs
import meticulous from "@alwaysmeticulous/recorder-plugin/rspack";

export default {
  plugins: [
    meticulous({ recordingToken: "<your-recording-token>" }),
  ],
};
```

For [rsbuild](https://rsbuild.dev/), pass the plugin through `tools.rspack`:

```ts
// rsbuild.config.ts
import { defineConfig } from "@rsbuild/core";
import meticulous from "@alwaysmeticulous/recorder-plugin/rspack";

export default defineConfig({
  tools: {
    rspack: {
      plugins: [
        meticulous({ recordingToken: "<your-recording-token>" }),
      ],
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

The Nuxt module installs the Vite plugin (the default Nuxt 3 bundler) and the
webpack plugin (legacy Nuxt builds), so the recorder script is injected into
the rendered HTML regardless of which bundler Nuxt is using.

</details>

## Options

```ts
import type { Options } from "@alwaysmeticulous/recorder-plugin";
```

| Option                 | Type                                                       | Default                                            | Description |
| ---------------------- | ---------------------------------------------------------- | -------------------------------------------------- | ----------- |
| `recordingToken`       | `string` (required)                                        | —                                                  | Your Meticulous recording token. Emitted as `data-recording-token` on the injected `<script>`. |
| `enabled`              | `"development" \| "always" \| "never" \| (ctx) => boolean` | `"development"`                                    | When to inject. `"development"` only injects during dev/preview builds (Vite `command === "serve"` or webpack/rspack `mode !== "production"`). Pass a function for full control. |
| `inject`               | `"auto" \| "replace"`                                      | `"auto"`                                           | `"auto"` prepends a new `<script>` as the first child of `<head>`. `"replace"` swaps a placeholder script tag (see below). |
| `placeholderAttribute` | `string`                                                   | `"data-meticulous"`                                | Attribute name used to find the placeholder when `inject: "replace"`. |
| `snippetUrl`           | `string`                                                   | `"https://snippet.meticulous.ai/v1/meticulous.js"` | Override the snippet URL. |
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
    "data-is-production-environment": process.env.MY_ENV === "prod" ? "true" : "false",
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
  mode?: string;        // Vite mode / webpack mode / NODE_ENV fallback
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
