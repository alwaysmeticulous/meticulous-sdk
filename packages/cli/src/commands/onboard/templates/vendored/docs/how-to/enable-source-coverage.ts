import { WHERE_CAN_I_REACH_OUT_FOR_SUPPORT } from "../constants";

export const document = `---
{
  "title": "Viewing source coverage information in Meticulous"
}
---

# {% $frontmatter.title %}

Meticulous can be set up to show you what parts of your code are being tested by us. In order to use this feature you must be serving [source maps](https://web.dev/articles/source-maps) for your code in at least some of the environments you're testing against (for instance, if building source maps significantly slows down your build you could do this only on pushes
to your main branch to avoid delaying PR runs).

## How can I view my source coverage?

To view your coverage information, visit your project's landing page on Meticulous (that is, the \`Overview\` tab). From there click the
\`View coverage & snapshots\` button, and select the \`Sources\` tab. You'll see a list of all the files in your project, and for each file
you'll see a percentage of the lines in that file that are covered by your tests. You can click on a file to see the exact lines that are
covered and not covered.

## How can I serve source maps so Meticulous finds them?

Meticulous will autodetect your source maps in three different ways (you only need to do one of these):

1. You serve the source map in the same directory as the file it corresponds to, with the same name as the file, but with a \`.map\`
extension added at the end. For instance, if you have a file \`https://mysite.com/static/assets/index.js\` then you should serve the
source map at \`https://mysite.com/static/assets/index.js.map\`.
2. You have a \`sourceMappingURL\` comment at the end of your file that points to the source map as documented
[here](https://firefox-source-docs.mozilla.org/devtools-user/debugger/how_to/use_a_source_map/index.html).
3. You set the \`SourceMap\` HTTP header on the response that serves the file to point to the source map as documented
[here](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/SourceMap).


## CSS source maps

Meticulous also reports which of your stylesheets each test covered. Doing that needs a source map for the bundled CSS your app
loaded, which is a separate artifact from your JavaScript source maps — turning source maps on for JavaScript does not
necessarily produce one. Meticulous finds a CSS source map in the same three ways listed above: a \`.map\` file served next to the
CSS asset, a \`sourceMappingURL\` comment at the end of the stylesheet, or a \`SourceMap\` response header.

### Vite

Vite does not emit CSS source maps for production builds at all
([vitejs/vite#2830](https://github.com/vitejs/vite/issues/2830)), and \`build.sourcemap: true\` covers JavaScript only — it does
nothing for CSS. Without a CSS source map a bundled stylesheet is opaque to us, and its coverage cannot be attributed to any file
in your repository.

Our plugin closes that gap. It reconstructs a \`<asset>.css.map\` for every CSS asset your build emits, and appends the
\`sourceMappingURL\` comment that points at it:

\`\`\`shell
npm install @alwaysmeticulous/recorder-plugin@latest --save-dev
\`\`\`

\`\`\`typescript
// vite.config.ts
import CssSourcemapPlugin from "@alwaysmeticulous/recorder-plugin/css-sourcemap";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [CssSourcemapPlugin()],
});
\`\`\`

The same plugin is available as the named export \`cssSourcemapPlugin\` if you prefer. It is independent of the recorder-injection
plugin in the same package, so you can use either or both, and it works under Rolldown — used by both the \`rolldown-vite\`
package and Vite 8 — as well as under stock Vite.

If your Vite project lives in a subdirectory rather than at the root of your repository, pass \`root\` so that the emitted source
paths match the paths Meticulous sees:

\`\`\`typescript
CssSourcemapPlugin({ root: path.resolve(__dirname, "../..") });
\`\`\`

#### How precise is the attribution?

Every stylesheet in the bundle is attributed to the file it came from, whether that is plain CSS, a CSS module, Sass/SCSS, Less,
or Tailwind. How precise that attribution is *within* a file depends on the stylesheet:

1. CSS that reaches the bundle unchanged, in its own file, maps line for line.
2. Anything a preprocessor rewrote (Sass/SCSS, Less) maps approximately, because Vite discards preprocessor source maps in
production builds.
3. Tailwind \`@import\`s keep line-level maps: the plugin reads the transform map \`@tailwindcss/vite\` already builds (Vite's
combiner would otherwise drop it). Generated utilities still attribute to the Tailwind entry or \`tailwindcss/index.css\`, not
to the \`className\` that produced them.
4. Rules below an \`@import\` get the right file but shifted line numbers, because the stylesheet is recorded after Vite has inlined
the import.

File-level attribution is enough for Meticulous to tell you which stylesheet a change touched, which is what the coverage needs.

#### The tradeoff: CSS minification

The plugin disables Vite's CSS minification, and that is what makes the emitted maps accurate — Vite minifies a CSS asset after
the plugin has recorded where each stylesheet landed inside it. Measured on two real apps, the shipped CSS grew by about 11%
gzipped on a React and Mantine app, and about 6% on a Tailwind app, with build time within noise. The \`.css.map\` files themselves
are only fetched by tooling and never on a page load, so they add nothing to what your users download.

Because of that cost, enable the plugin on the build whose coverage Meticulous collects rather than on every production build.
You can keep minification on with \`disableCssMinify: false\`, but then the plugin emits no map at all and warns, rather than
emitting a partial one that would attribute some stylesheets' rules to their neighbours.


## Monorepos

If you&apos;re using a monorepo, you&apos;ll need to build source maps for each package in your monorepo that your app depends on.

For example, if your app is within \`apps/frontend\` and you have a package \`packages/utils\` that the app depends on,
you&apos;ll need to build source maps for both of these packages. You might need to adjust your build process to load source maps
for your dependencies, e.g. by using \`source-map-loader\` in your webpack config.


### Example Next.js setup

1. Enable source maps generation in your dependent packages.
  \`packages/utils/tsconfig.json\`:
    \`\`\`json
    {
      ...
      "sourceMap": true,
      "declarationMap": true
    }
    \`\`\`
2. Install \`source-map-loader\` in your Next.js project:
      \`\`\`bash
      npm install --save-dev source-map-loader <OR>
      yarn add --dev source-map-loader <OR>
      pnpm add --save-dev source-map-loader
      \`\`\`
3. Add the following to your Next.js project&apos;s \`next.config.js\` in order to load source maps from your monorepo packages:
      \`\`\`javascript
      module.exports = {
        ...
        webpack: (config, { isServer }) => {
          // Ensure TypeScript source maps from monorepo packages work correctly
          config.module.rules.push({
            test: /\\.js$/,
            use: ['source-map-loader'],
            enforce: 'pre',
          });

          // Silence source map parsing warnings.
          config.ignoreWarnings = [
            ...(config.ignoreWarnings || []),
            /Failed to parse source map/,
          ];

          return config;
        },
      };
      \`\`\`

${WHERE_CAN_I_REACH_OUT_FOR_SUPPORT}
`;
