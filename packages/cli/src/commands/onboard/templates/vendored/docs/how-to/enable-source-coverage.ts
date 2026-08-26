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
