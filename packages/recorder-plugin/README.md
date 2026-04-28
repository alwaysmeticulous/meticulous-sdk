# @alwaysmeticulous/recorder-plugin

Template package for a Meticulous [unplugin](https://github.com/unjs/unplugin) — a single plugin that ships entry
points for Vite, Webpack, Rspack, Rollup, Rolldown, esbuild, and Farm.

This package is scaffolded as a starting point. The transform currently injects a marker comment at the top of every
matched module so the wiring can be verified end-to-end; replace the body of `transform.handler` in `src/index.ts`
with your real logic.

> This package is ESM-only (`"type": "module"`, built with [`tsdown`](https://tsdown.dev/)) and follows
> [`unplugin@3`](https://github.com/unjs/unplugin). Requires Node.js 20.19+.

## Installing

```shell
npm install @alwaysmeticulous/recorder-plugin --save-dev
# or with yarn
yarn add -D @alwaysmeticulous/recorder-plugin
# or with pnpm
pnpm add -D @alwaysmeticulous/recorder-plugin
```

## Usage

<details>
<summary>Vite</summary>

```ts
// vite.config.ts
import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/vite";

export default defineConfig({
  plugins: [RecorderPlugin()],
});
```

</details>

<details>
<summary>Rollup</summary>

```ts
// rollup.config.js
import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/rollup";

export default {
  plugins: [RecorderPlugin()],
};
```

</details>

<details>
<summary>Rolldown / tsdown</summary>

```ts
// rolldown.config.ts / tsdown.config.ts
import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/rolldown";

export default {
  plugins: [RecorderPlugin()],
};
```

</details>

<details>
<summary>esbuild</summary>

```ts
import { build } from "esbuild";
import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/esbuild";

build({
  plugins: [RecorderPlugin()],
});
```

</details>

<details>
<summary>Webpack</summary>

```js
// webpack.config.mjs
import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/webpack";

export default {
  /* ... */
  plugins: [RecorderPlugin()],
};
```

If your `webpack.config.js` is still CommonJS, rename it to `.mjs` or load the plugin via dynamic `import()`.

</details>

<details>
<summary>Rspack</summary>

```js
// rspack.config.mjs
import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/rspack";

export default {
  /* ... */
  plugins: [RecorderPlugin()],
};
```

</details>

<details>
<summary>Farm</summary>

```ts
// farm.config.ts
import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/farm";

export default {
  plugins: [RecorderPlugin()],
};
```

</details>

<details>
<summary>Bun</summary>

```ts
import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/bun";

Bun.build({
  entrypoints: ["./src/index.ts"],
  plugins: [RecorderPlugin()],
});
```

</details>

<details>
<summary>Unloader</summary>

```ts
// unloader.config.ts
import RecorderPlugin from "@alwaysmeticulous/recorder-plugin/unloader";

export default {
  plugins: [RecorderPlugin()],
};
```

</details>

## Options

```ts
import type { Options } from "@alwaysmeticulous/recorder-plugin";

const options: Options = {
  // Files to apply the transform to. Defaults to JS/TS source files.
  include: [/\.[cm]?[jt]sx?$/],
  // Files to skip. Defaults to anything inside `node_modules`.
  exclude: [/node_modules/],
  // When the plugin runs relative to other plugins.
  enforce: "pre",
};
```
